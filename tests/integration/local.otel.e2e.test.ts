// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import {
    incrementCounter,
    initializeTelemetry,
    recordHistogram,
    reinitializeTelemetry
} from '../../src/signals.js';
import { Configuration } from '../../src/config.js';
import { ResourceAttributes } from '../../src/attributes.js';
import * as fs from 'fs/promises';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const exportFilePath = '/tmp/otel-output/otel-out.json';

async function checkResourceAttribute(key: string, value: string): Promise<boolean> {
    try {
        const content = await fs.readFile(exportFilePath, 'utf-8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
            if (!line.trim()) continue;
            const data = JSON.parse(line);
            if (data.resourceMetrics) {
                for (const rm of data.resourceMetrics) {
                    if (rm.resource.attributes.some((attr: any) => 
                        attr.key === key && attr.value.stringValue === value)) {
                        return true;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in checkResourceAttribute:', error);
    }
    return false;
}

test("Verify environment=test resource attribute", async () => { 
    const config = new Configuration(new URL("http://localhost:4318/v1/metrics")).setMetricExportIntervalMs(100);
    const attrs = new ResourceAttributes("test-service", "v1.0.0").setAttributes({environment: "test"});
    
    initializeTelemetry(config, attrs, ["metrics"]);
    recordHistogram({name: "test_histogram", value: 100});
    await sleep(1100);  // collector flush interval is 1 second
    
    const result = await checkResourceAttribute('environment', 'test');
    expect(result).toBe(true);
});

test("Verify userId=12345 resource attribute after reinitialize", async () => {
    const config = new Configuration(new URL("http://localhost:4318/v1/metrics")).setMetricExportIntervalMs(100);
    const attrs = new ResourceAttributes("test-service", "v1.0.0").setAttributes({environment: "test"});
    
    initializeTelemetry(config, attrs, ["metrics"]);
    recordHistogram({name: "test_histogram", value: 100});
    
    attrs.setAttributes({userId: "12345"});
    reinitializeTelemetry(attrs);
    incrementCounter({name: "test_counter", by: 1});
    await sleep(1100);  // collector flush interval is 1 second
    
    expect(await checkResourceAttribute('user.id', '12345')).toBe(true);
});