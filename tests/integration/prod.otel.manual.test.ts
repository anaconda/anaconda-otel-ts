// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

test("Verify collector endpoint accepts metrics", async () => {
    const testData = JSON.stringify({
        resourceMetrics: [{
            resource: { 
                attributes: [
                    { key: 'service.name', value: { stringValue: 'integration-test' } },
                    { key: 'environment', value: { stringValue: 'test' } }
                ]
            },
            scopeMetrics: [{
                scope: { name: 'test-scope' },
                metrics: [{
                    name: 'test_metric',
                    unit: 'ms',
                    sum: {
                        dataPoints: [{
                            asInt: 123,
                            timeUnixNano: Date.now() * 1000000,
                            startTimeUnixNano: (Date.now() - 1000) * 1000000
                        }],
                        aggregationTemporality: 2,
                        isMonotonic: false
                    }
                }]
            }]
        }]
    });
    
    const result = await new Promise<boolean>((resolve) => {
        const url = new URL(process.env.ATEL_DEFAULT_ENDPOINT || 'http://localhost:4318/v1/metrics');  // will fail if no env var
        const https = require('https');
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(testData),
                'User-Agent': 'GitHub Actions Runner',
                'Authorization': `Bearer ${process.env.ATEL_DEFAULT_AUTH_TOKEN}`
            }
        }, (res: any) => {
            // Consume the response data to ensure the socket closes
            res.on('data', () => {});
            res.on('end', () => {
                resolve(res.statusCode >= 200 && res.statusCode < 300);
            });
        });
        
        req.on('error', () => resolve(false));
        req.write(testData);
        req.end();
    });

    expect(result).toBe(true);
    
    // Small delay to ensure socket cleanup
    await new Promise(resolve => setTimeout(resolve, 10));
});