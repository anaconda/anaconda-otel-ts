// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { type AttrMap } from './types.js';
import { Configuration, type EndpointTuple } from './config.js';
import { ResourceAttributes } from './attributes.js';
import { AnacondaCommon } from "./common.js";
import { MetricExporterShim } from './exporter_shims.js';

// ----- your value imports (keep as-is) -----
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import * as sdkMetricsNS from '@opentelemetry/sdk-metrics';
const {
  MeterProvider,
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} = sdkMetricsNS;

import * as httpNS from '@opentelemetry/exporter-metrics-otlp-http';
const { OTLPMetricExporter: OTLPMetricExporterHTTP } = httpNS;

import * as grpcExporterNS from '@opentelemetry/exporter-metrics-otlp-grpc';
const { OTLPMetricExporter: OTLPMetricExporterGRPC } = grpcExporterNS;

import grpc from '@grpc/grpc-js';
const { ChannelCredentials } = grpc;

// ----- type-only imports -----
import type {
  Meter,
  UpDownCounter,
  Counter,
  Histogram,
} from '@opentelemetry/api';

import type {
  PushMetricExporter,
  ResourceMetrics,
  MeterProvider as _MeterProvider,
  PeriodicExportingMetricReader as _PeriodicExportingMetricReader,
  PeriodicExportingMetricReaderOptions as _PeriodicExportingMetricReaderOptions,
} from '@opentelemetry/sdk-metrics';

import type { ChannelCredentials as _ChannelCredentials } from '@grpc/grpc-js';

// ----- local type aliases that REUSE the value names -----
type MeterProvider = _MeterProvider;
type PeriodicExportingMetricReader = _PeriodicExportingMetricReader;
type ChannelCredentials = _ChannelCredentials;
type PeriodicExportingMetricReaderOptions = _PeriodicExportingMetricReaderOptions;

export class CounterArgs {
    name: string = "";
    by?: number = 1;
    forceUpDownCounter?: boolean = false;
    attributes?: AttrMap = {}
}

export class HistogramArgs {
    name: string = "";
    value: number = 0;
    attributes?: AttrMap = {};
}

export class AnacondaMetrics extends AnacondaCommon {
    private reader: PeriodicExportingMetricReader | undefined;
    mapOfCounters: Record<string, [UpDownCounter | Counter, boolean]> = {};
    mapOfHistograms: Record<string, Histogram> = {};
    meterProvider: MeterProvider | undefined = undefined
    meter: Meter | null = null;
    parentExporter: MetricExporterShim | undefined
    testLastBy: number = 0

    constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes);
        this.setup()
    }

    async changeConnection(endpoint: URL | undefined, authToken: string | undefined,
                           certFile: string | undefined, userId: string | undefined): Promise<boolean> {
        let [url, token, cert] = this.config.getMetricsEndpointTuple()
        if (endpoint !== url && endpoint !== undefined) {
            this.config.metricsEndpoint![0] = endpoint
        }
        if (authToken !== token) {
            this.config.metricsEndpoint![1] = authToken
        }
        if (certFile !== cert) {
            this.config.metricsEndpoint![2] = certFile
        }
        let id = userId?.trim()
        if (typeof id === 'string' && id.length > 0) {
            this.attributes.userId = id
        }
        var [scheme, ep] = this.transformURL(this.config.metricsEndpoint![0])
        var creds: ChannelCredentials | undefined = this.readCredentials(scheme, this.config.metricsEndpoint![2])
        var headers = this.makeHeaders(scheme, authToken)
        var exporter = this.makeExporter(scheme, ep, headers, creds)
        if (exporter === undefined) {
            return false
        }
        await this.reader?.forceFlush()
        var oldExporter = await this.parentExporter?.swapExporter(exporter!)
        await oldExporter?.shutdown()
        return true
    }

    recordHistogram(args: HistogramArgs): boolean {
        if (!this.meter) {
            this.warn("Meter is not initialized properly. Ensure that the AnacondaMetrics instance is properly set up.")
            return false
        }
        if (!this.isValidName(args.name)) {
            this.warn(`Metric name '${args.name}' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).`)
            return false
        }
        var histogram = this.getHistogram(args.name)
        histogram.record(args.value!, this.makeEventAttributes(args.attributes));
        return true
    }

    incrementCounter(args: CounterArgs): boolean {
        if (!this.meter) {
            this.warn("Meter is not initialized properly. Ensure that the AnacondaMetrics instance is properly set up.")
            return false
        }
        if (!this.isValidName(args.name)) {
            this.warn(`Metric name '${args.name}' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).`)
            return false
        }
        var [counter, isUpDown] = this.getCounter(args.name, args.forceUpDownCounter!)
        let by: number = args.by ? Math.abs(args.by!) : 1;
        counter.add(by, this.makeEventAttributes(args.attributes))
        return true
    }

    decrementCounter(args: CounterArgs): boolean {
        if (!this.meter) {
            this.warn("Meter is not initialized properly. Ensure that the AnacondaMetrics instance is properly set up.")
            return false
        }
        if (!this.isValidName(args.name)) {
            this.warn(`Metric name '${args.name}' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).`)
            return false
        }
        var [counter, isUpDown] = this.getCounter(args.name, true)
        if (isUpDown === false) {
            this.warn(`Metric name '${args.name}' is not a UpDownCounter, decrement is not allowed.`)
            return false
        }
        let by: number = args.by ? -Math.abs(args.by!) : -1;
        this.testLastBy = by
        counter.add(by, this.makeEventAttributes(args.attributes))
        return true
    }

    async flush(): Promise<void> {
        try {
            await this.reader?.forceFlush()
        } catch (error) {
            // Log export failures instead of crashing the application
            // This matches Python SDK behavior where export failures are logged
            if (error instanceof Error) {
                this.warn(`Metric export failed: ${error.message}`)
            } else {
                this.warn(`Metric export failed: ${String(error)}`)
            }
        }
    }

    private makeExporter(scheme: string, url: URL, httpHeaders: Record<string,string>,
                         creds?: ChannelCredentials): PushMetricExporter | undefined {
        var urlStr = url.href
        var exporter: PushMetricExporter | undefined = undefined
        if (scheme === 'grpc:' || scheme === 'grpcs:') {
            urlStr = `${url.hostname}:${url.port}`
            exporter = new OTLPMetricExporterGRPC({
                url: urlStr,
                credentials: creds,
                temporalityPreference: this.config.getUseCumulativeMetrics() ?
                    httpNS.AggregationTemporalityPreference.CUMULATIVE :
                    httpNS.AggregationTemporalityPreference.DELTA
            });
        } else if (scheme === 'http:' || scheme === 'https:') {
            exporter = new OTLPMetricExporterHTTP({
                url: urlStr,
                headers: httpHeaders,
                temporalityPreference: this.config.getUseCumulativeMetrics() ?
                    httpNS.AggregationTemporalityPreference.CUMULATIVE :
                    httpNS.AggregationTemporalityPreference.DELTA
            });
        } else if (scheme === 'console:') {
            exporter = new ConsoleMetricExporter()
        } else if (scheme === 'devnull:') {
            exporter = new NoopMetricExporter()
        } else {
            this.warn(`Received bad scheme for metrics: ${scheme}!`)
        }
        return exporter
    }

    private makeReader(scheme: string, url: URL, httpHeaders: Record<string,string>, creds?: ChannelCredentials): PeriodicExportingMetricReader | undefined {
        this.debug(`Creating Reader for endpoint type '${scheme}'.`)
        var exporter = this.makeExporter(scheme, url, httpHeaders, creds)
        if (exporter === undefined) {
            return undefined
        }
        this.parentExporter = new MetricExporterShim(exporter!)
        const reader = new PeriodicExportingMetricReader({
            exporter: this.parentExporter!,
            exportIntervalMillis: this.metricsExportIntervalMs
        });
        return reader
    }

    private readCredentials(scheme: string, certFile?: string): ChannelCredentials | undefined {
        var creds: ChannelCredentials | undefined = undefined
        if (certFile && scheme === ("grpcs:")) {
            const certContent = this.readCertFile(certFile)
            if (certContent) {
                creds = ChannelCredentials.createSsl(Buffer.from(certContent))
            } else {
                this.warn(`Failed to read certificate file: ${certFile}`)
            }
        }
        return creds
    }

    private setup(): void {
        if (this.config.useDebug) {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
        }
        var [endpoint, authToken, certFile] = this.config.getMetricsEndpointTuple()
        var [scheme, ep] = this.transformURL(endpoint)
        var creds: ChannelCredentials | undefined = this.readCredentials(scheme, certFile)
        var headers = this.makeHeaders(scheme, authToken)
        const reader: PeriodicExportingMetricReader | undefined = this.makeReader(scheme, ep, headers, creds)
        if (reader != undefined) {
            this.reader = reader
            this.meterProvider = new MeterProvider({ readers: [this.reader!], resource: this.resources })
            this.meter = this.meterProvider.getMeter(this.serviceName, this.serviceVersion)
            if (this.meter) {
                this.debug("Meter created successfully.")
            } else {
                this.warn("Meter was not created!")
            }
        } else {
            this.warn("Periodic Metric Reader was not created!")
        }
    }

    private getCounter(metricName: string, forceUpDownCounter: boolean): [UpDownCounter | Counter, boolean] {
        if (metricName in this.mapOfCounters) {
            return this.mapOfCounters[metricName]
        }
        var counter: Counter | UpDownCounter
        if (forceUpDownCounter) {
            counter = this.meter!.createUpDownCounter(metricName)
        } else {
            counter = this.meter!.createCounter(metricName)
        }
        this.mapOfCounters[metricName] = [counter, forceUpDownCounter]
        return [counter, forceUpDownCounter]
    }

    private getHistogram(metricName: string): Histogram {
        if (metricName in this.mapOfHistograms) {
            return this.mapOfHistograms[metricName]
        }
        var histogram: Histogram = this.meter!.createHistogram(metricName)
        this.mapOfHistograms[metricName] = histogram
        return histogram
    }
}

export class NoopMetricExporter implements PushMetricExporter {
    constructor(_options?: any) {}

    export(_metrics: ResourceMetrics, resultCallback: (result: { code: number }) => void): void {
        resultCallback({ code: 0 });
    }

    async shutdown(): Promise<void> {
        return Promise.resolve();
    }

    async forceFlush(): Promise<void> {
        return Promise.resolve();
    }
}
