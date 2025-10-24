// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { type ResourceMetrics, type PushMetricExporter } from '@opentelemetry/sdk-metrics';
import { type ReadableSpan, type SpanExporter } from '@opentelemetry/sdk-trace-base'
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { Resource } from '@opentelemetry/resources';
import { SpanKind, type SpanContext } from '@opentelemetry/api';

import { MetricExporterShim, SpanExporterShim } from '../../src/exporter_shims';

// globals for testing in async-await contexts.
var ff_ok: boolean = false
var s_ok: boolean = false

class MockMetricExporter implements PushMetricExporter {
    constructor() {}

    export(_metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
        resultCallback({ code: ExportResultCode.SUCCESS });
    }

    async shutdown(): Promise<void> {
        s_ok = true
        return Promise.resolve();
    }

    async forceFlush(): Promise<void> {
        ff_ok = true
        return Promise.resolve();
    }
}

class ErrorMetricExporter implements PushMetricExporter {
    private exceptionType: boolean
    constructor(exceptionType: boolean = false) { this.exceptionType = exceptionType }

    export(_metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
        if (this.exceptionType) {
            throw new Error("Exception Error")
        } else {
            resultCallback({ code: ExportResultCode.FAILED });
        }
    }

    async shutdown(): Promise<void> {
        s_ok = true
        return Promise.resolve();
    }

    async forceFlush(): Promise<void> {
        ff_ok = true
        return Promise.resolve();
    }
}

class MockSpanExporter implements SpanExporter {
    constructor() {}

    export(_spans: ReadableSpan[], resultCallback: (result: { code: number }) => void): void {
        resultCallback({ code: ExportResultCode.SUCCESS });
    }

    async shutdown(): Promise<void> {
        s_ok = true
        return Promise.resolve();
    }

    async forceFlush?(): Promise<void> {
        ff_ok = true
        return Promise.resolve();
    }
}

class ErrorSpanExporter implements SpanExporter {
    private exceptionType: boolean
    constructor(exceptionType: boolean = false) { this.exceptionType = exceptionType }

    export(_spans: ReadableSpan[], resultCallback: (result: { code: number }) => void): void {
        if (this.exceptionType) {
            throw new Error("Exception Error")
        } else {
            resultCallback({ code: ExportResultCode.FAILED });
        }
    }

    async shutdown(): Promise<void> {
        s_ok = true
        return Promise.resolve();
    }
}

const mockResourceMetrics: jest.Mocked<ResourceMetrics> = {
  resource: { attributes: { service: 'test' } } as any,
  scopeMetrics: [
    {
      scope: { name: 'mock-scope', version: '1.0.0' } as any,
      metrics: [] as any,
    },
  ],
};

const mockResource = { attributes: { 'service.name': 'mock-service' } } as unknown as Resource;

const mockReadableSpan: ReadableSpan = {
    name: 'mock-span',
    spanContext: (): SpanContext => ({
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000001',
        traceFlags: 1,
    }),
    startTime: [0, 0],
    endTime: [1, 0],
    attributes: { key: 'value' },
    events: [],
    links: [],
    status: { code: 0 },
    resource: mockResource,
    instrumentationScope: { name: 'mock-lib', version: '1.0.0' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    kind: SpanKind.INTERNAL,
    duration: [0, 0],
    ended: false
};

test("verify Metrics exporter shim class", () => {
    s_ok = false
    ff_ok = false
    var mockExporter = new MockMetricExporter()
    var ut = new MetricExporterShim(mockExporter)
    var metrics: ResourceMetrics = mockResourceMetrics

    // Good path
    ut.export(metrics, (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.SUCCESS) })
    ut.forceFlush().then(() => {
        expect(ff_ok).toBe(true)
    })

    ut.shutdown().then(() => {
        expect(s_ok == true)
    })

    // After shutdown...
    ut.forceFlush().then(() => {})
    ut.shutdown().then(() => {})

    var metrics: ResourceMetrics = mockResourceMetrics
    ut.export(metrics, (result: ExportResult) => {
        expect(result.code).toBe(ExportResultCode.FAILED); // returns FAILED because of shutdown...
    });

    // make sure swap resets shutdown flag
    mockExporter = new MockMetricExporter()
    ut.swapExporter(mockExporter)
    ut.export(metrics, (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.SUCCESS) })

    // Bad paths.
    mockExporter = new ErrorMetricExporter()
    ut.swapExporter(mockExporter)
    ut.export(metrics, (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.FAILED) })

    mockExporter = new ErrorMetricExporter(true)
    ut.swapExporter(mockExporter)
    ut.export(metrics, (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.FAILED) })
});

test("verify Span exporter shim class", () => {
    s_ok = false
    ff_ok = false
    var mockExporter = new MockSpanExporter()
    var ut = new SpanExporterShim(mockExporter)
    var span: ReadableSpan = mockReadableSpan

    // Good path
    ut.export([span], (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.SUCCESS); })
    ut.forceFlush?.().then(() => {
        expect(ff_ok).toBe(true)
    })

    ut.shutdown().then(() => {
        expect(s_ok == true)
    })

    // After shutdown...
    ut.forceFlush?.().then(() => {})
    ut.shutdown().then(() => {})

    var metrics: ResourceMetrics = mockResourceMetrics
    ut.export([span], (result: ExportResult) => {
        expect(result.code).toBe(ExportResultCode.FAILED); // returns FAILED because of shutdown...
    });

    // make sure swap resets shutdown flag
    mockExporter = new MockSpanExporter()
    ut.swapExporter(mockExporter)
    ut.export([span], (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.SUCCESS) })

    // Bad paths.
    mockExporter = new ErrorSpanExporter()
    ut.swapExporter(mockExporter)
    ut.export([span], (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.FAILED) })

    mockExporter = new ErrorSpanExporter(true)
    ut.swapExporter(mockExporter)
    ut.export([span], (result: ExportResult) => { expect(result.code).toBe(ExportResultCode.FAILED) })
    ut.forceFlush?.().then() // Doesn't exist in the ErrorSpanExporter.
});
