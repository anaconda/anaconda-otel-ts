// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import {
    flushAllSignals,
    incrementCounter,
    initializeTelemetry,
    recordHistogram
} from '../../src/signals.js';
import { Configuration } from '../../src/config.js';
import { ResourceAttributes } from '../../src/attributes.js';
import * as fs from 'fs/promises';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// MUST run from the repo root.
const exportFilePath = '/tmp/otel-output/metrics.json';

async function getResourceAttribute(key: string): Promise<string | undefined> {
    try {
        const content = await fs.readFile(exportFilePath, 'utf-8');
        const lines = content.trim().split('\n');
        const line = lines[lines.length - 1]
        const data = JSON.parse(line);
        const resourceMetric = data.resourceMetrics[data.resourceMetrics.length > 0 ? data.resourceMetrics.length - 1 : 0]
        for (const a of resourceMetric.resource.attributes) {
            if (a.key === key) {
                console.info(`>>> Found key '${key}' with value '${a.value.stringValue ?? '<undefined>'}'`)
                return a.value.stringValue
            }
        }
        console.warn(`Failed to find the key '${key}'!`)
    } catch (error) {
        console.error('Error in getResourceAttribute:', error);
    }
    return undefined
}

async function getUserID(): Promise<string | undefined> {
    try {
        const content = await fs.readFile(exportFilePath, 'utf-8');
        const lines = content.trim().split('\n');
        const last = lines[lines.length - 1]
        const data = JSON.parse(last);
        const metrics = data.resourceMetrics[0].scopeMetrics[0].metrics
        const metricsLastIdx: number = metrics.length > 0 ? metrics.length - 1: 0
        const sum = metrics[metricsLastIdx].sum
        const histogram = metrics[metricsLastIdx].histogram
        const dataPoints = sum ? sum.dataPoints : histogram.dataPoints
        const attr = dataPoints[0].attributes
        for (const a of attr) {
            if (a.key === "user.id") {
                return a.value.stringValue
            }
        }
        console.warn(`Failed to find the 'user.id' key in attributes!`)
    } catch (error) {
        console.error('Error in checkForUserID:', error);
    }
    return undefined
}

test("Verify environment=test resource and metric attributes", async () => {
    const config = new Configuration(new URL("http://localhost:4318/v1/metrics")).setMetricExportIntervalMs(1000);
    const attrs = new ResourceAttributes("test-service", "v1.0.0").setAttributes({environment: "test"});

    initializeTelemetry(config, attrs, ["metrics"]);
    recordHistogram({name: "test_histogram", value: 100});
    incrementCounter({name: "test_counter", by: 1, attributes: {'user.id': '12345'}});
    flushAllSignals()

    await sleep(1000) // Allow for collector write time
    const env = await getResourceAttribute('environment');
    const user = await getUserID()
    expect(env).toBe('test');
    expect(user).toBe('12345');
});
