// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { type ResourceMetrics, type PushMetricExporter } from '@opentelemetry/sdk-metrics';
import { type ReadableSpan, type SpanExporter } from '@opentelemetry/sdk-trace-base'
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';

import { Lock } from './lock_object.js'


export class MetricExporterShim implements PushMetricExporter {
    private _internalExporter: PushMetricExporter;
    private _shutdown = false;
    private readonly _lock = new Lock();

    constructor(initial: PushMetricExporter) {
        this._internalExporter = initial;
    }

    // Fire-and-forget swap (returns old exporter immediately)
    async swapExporter(newExporter: PushMetricExporter): Promise<PushMetricExporter> {
        const saved = this._internalExporter;
        await this._lock.runExclusive(() => {
            this._internalExporter = newExporter;
            this._shutdown = false;
        });
        return saved;
    }

    export(metrics: ResourceMetrics, resultCallback: (r: ExportResult) => void): void {
        if (this._shutdown) {
            resultCallback({ code: ExportResultCode.FAILED, error: new Error('exporter is shutdown') });
        } else {
            void this._lock.runExclusive(() => {
                    try {
                        this._internalExporter.export(metrics, resultCallback);
                    } catch (err) {
                        resultCallback({ code: ExportResultCode.FAILED, error: err as Error });
                    }
            });
        }
    }

    async forceFlush(): Promise<void> {
        if (!this._shutdown) {
            return await this._lock.runExclusive(async () => {
                await this._internalExporter.forceFlush();
            });
        } else {
            return Promise.resolve()
        }
    }

    async shutdown(): Promise<void> {
        if (!this._shutdown) {
            return await this._lock.runExclusive(async () => {
                await this._internalExporter.shutdown();
                this._shutdown = true;
            });
        } else {
            return Promise.resolve()
        }
    }

    isShutdown(): boolean {
        return this._shutdown
    }
}

export class SpanExporterShim implements SpanExporter {
    private _internalExporter: SpanExporter;
    private _shutdown = false;
    private readonly _lock = new Lock();

    constructor(initial: SpanExporter) {
        this._internalExporter = initial;
    }

    // Fire-and-forget swap (returns old exporter immediately)
    async swapExporter(newExporter: SpanExporter): Promise<SpanExporter> {
        const saved = this._internalExporter;
        await this._lock.runExclusive(() => {
            this._internalExporter = newExporter;
            this._shutdown = false;
        });
        return saved;
    }

    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        if (this._shutdown) {
            resultCallback({ code: ExportResultCode.FAILED, error: new Error('exporter is shutdown') });
        } else {
            void this._lock.runExclusive(() => {
                try {
                    this._internalExporter.export(spans, resultCallback);
                } catch (err) {
                    resultCallback({ code: ExportResultCode.FAILED, error: err as Error });
                }
            });
        }
    }

    async shutdown(): Promise<void> {
        if (!this._shutdown) {
            return await this._lock.runExclusive(async () => {
                await this._internalExporter.shutdown();
                this._shutdown = true;
            });
        } else {
            return Promise.resolve()
        }
    }

    async forceFlush?(): Promise<void> {
        if (!this._shutdown) {
            return await this._lock.runExclusive(async () => {
                await this._internalExporter.forceFlush?.();
            });
        } else {
            return Promise.resolve()
        }
    }

    isShutdown(): boolean {
        return this._shutdown
    }
}
