// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import http from 'http';
import * as fs from 'fs/promises';
import { initializeTelemetry, getTrace, flushAllSignals } from '../../src/signals.js';
import { Configuration } from '../../src/config.js';
import { ResourceAttributes } from '../../src/attributes.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const exportFilePath = '/tmp/otel-output/traces.json';

interface ExportedSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
}

async function getExportedSpans(retries = 5, delayMs = 500): Promise<ExportedSpan[]> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const content = await fs.readFile(exportFilePath, 'utf-8');
            if (!content.trim()) {
                await sleep(delayMs);
                continue;
            }
            const spans: ExportedSpan[] = [];

            const lines = content.trim().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const data = JSON.parse(line);
                for (const resourceSpan of data.resourceSpans ?? []) {
                    if (!resourceSpan.scopeSpans) {
                        continue;
                    }
                    for (const scopeSpan of resourceSpan.scopeSpans) {
                        for (const span of scopeSpan.spans ?? []) {
                            spans.push({
                                traceId: span.traceId,
                                spanId: span.spanId,
                                parentSpanId: span.parentSpanId || undefined,
                                name: span.name,
                            });
                        }
                    }
                }
            }
            if (spans.length > 0) {
                return spans;
            }
            await sleep(delayMs);
        } catch (error) {
            if (attempt === retries - 1) {
                console.error('Error reading exported spans:', error);
            }
            await sleep(delayMs);
        }
    }
    return [];
}

function parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res: http.ServerResponse, data: any) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

const serverA = http.createServer(async (req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        const span = getTrace('serviceA.process', {
            attributes: { service: 'A', id: '123' },
        });

        try {
            span?.addEvent('started');
            const carrier = span?.getCurrentCarrier() ?? {};

            const response = await fetch('http://localhost:8002/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carrier, data: 'hello' }),
            });

            const result = await response.json();
            sendJson(res, { from: 'A', result, carrier });
        } finally {
            span?.end();
        }
    }
});

const serverB = http.createServer(async (req, res) => {
    if (req.url === '/process' && req.method === 'POST') {
        const { carrier: parentCarrier = {}, data } = await parseBody(req);

        const span = getTrace('serviceB.process', {
            attributes: { service: 'B' },
            carrier: parentCarrier,
        });

        try {
            span?.addEvent('processing');
            const carrier = span?.getCurrentCarrier() ?? {};

            const response = await fetch('http://localhost:8003/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carrier, data: data.toUpperCase() }),
            });

            const result = await response.json();
            sendJson(res, { from: 'B', result });
        } finally {
            span?.end();
        }
    }
});

const serverC = http.createServer(async (req, res) => {
    if (req.url === '/process' && req.method === 'POST') {
        const { carrier: parentCarrier = {}, data } = await parseBody(req);

        const span = getTrace('serviceC.process', {
            attributes: { service: 'C' },
            carrier: parentCarrier,
        });

        try {
            span?.addEvent('finalizing');
            sendJson(res, { from: 'C', data, done: true });
        } finally {
            span?.end();
        }
    }
});

const servers = [serverA, serverB, serverC];

function startServices(): Promise<void> {
    const config = new Configuration(new URL('http://localhost:4318/v1/traces')).setTraceExportIntervalMs(500);
    const attrs = new ResourceAttributes('test_span_svc', 'v1.0.0');

    initializeTelemetry(config, attrs, ['tracing']);

    return new Promise((resolve) => {
        serverA.listen(8001, 'localhost');
        serverB.listen(8002, 'localhost');
        serverC.listen(8003, 'localhost');

        setTimeout(resolve, 500);
    });
}

function stopServices(): Promise<void[]> {
    return Promise.all(
        servers.map(
            (server) =>
                new Promise<void>((resolve) => {
                    server.close(() => resolve());
                })
        )
    );
}

test("Verify distributed tracing across three services", async () => {
    await startServices();

    const response = await fetch('http://localhost:8001/');
    const result = await response.json();

    flushAllSignals();
    await sleep(1000);

    expect(result.from).toBe('A');
    expect(result.result.from).toBe('B');
    expect(result.result.result.from).toBe('C');
    expect(result.result.result.data).toBe('HELLO');
    expect(result.result.result.done).toBe(true);
    expect(result.carrier).toHaveProperty('traceparent');

    const spans = await getExportedSpans();

    const spanA = spans.find(s => s.name === 'serviceA.process');
    const spanB = spans.find(s => s.name === 'serviceB.process');
    const spanC = spans.find(s => s.name === 'serviceC.process');

    expect(spanA).toBeDefined();
    expect(spanB).toBeDefined();
    expect(spanC).toBeDefined();

    expect(spanB!.traceId).toBe(spanA!.traceId);
    expect(spanC!.traceId).toBe(spanA!.traceId);

    expect(spanA!.parentSpanId).toBeFalsy();
    expect(spanB!.parentSpanId).toBe(spanA!.spanId);
    expect(spanC!.parentSpanId).toBe(spanB!.spanId);

    await stopServices();
});