// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { type AttrMap } from './types.js';
import { Configuration } from './config.js';
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
    private readers: PeriodicExportingMetricReader[] = [];
    mapOfCounters: Record<string, [UpDownCounter | Counter, boolean]> = {};
    mapOfHistograms: Record<string, Histogram> = {};
    meterProvider: MeterProvider | undefined = undefined
    meter: Meter | null = null;
    parentExporter: MetricExporterShim | undefined

    constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes);
        this.setup()
    }

    reinitialize(newAttributes: ResourceAttributes,
                 newEndpoint: URL | undefined = undefined,
                 newToken: string | undefined = undefined
    ): void {
        this.tearDown()
        this.makeNewResource(newAttributes)
        if(newEndpoint) {
            this.config.defaultEndpoint = [newEndpoint!, newToken, undefined]
        }
        this.setup()
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
        histogram.record(args.value!, args.attributes!);
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
        counter.add(by, args.attributes ?? {})
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
        let by: number = args.by ? -Math.abs(args.by!) : 1;
        counter.add(by, args.attributes ?? {})
        return true
    }

    private setExporter(newExporter: PushMetricExporter): PushMetricExporter | undefined {
        if (this.parentExporter == undefined) {
            this.parentExporter = new MetricExporterShim(newExporter)
            return undefined
        } else {
            return this.parentExporter.swapExporter(newExporter)
        }
    }

    private makeReader(scheme: string, url: URL, httpHeaders: Record<string,string>, creds?: ChannelCredentials): PeriodicExportingMetricReader | undefined {
        this.debug(`Creating Reader for endpoint type '${scheme}'.`)
        var urlStr = url.href
        if (scheme === 'grpc:' || scheme === 'grpcs:') {
            this.debug(`Creating GRPC reader for endpoint '${url.href}'...`)
            urlStr = `${url.hostname}:${url.port}`
            const exporter = new OTLPMetricExporterGRPC({
                url: urlStr,
                credentials: creds,
                temporalityPreference: this.config.getUseCumulativeMetrics() ?
                    sdkMetricsNS.AggregationTemporality.CUMULATIVE :
                    sdkMetricsNS.AggregationTemporality.DELTA
            });
            this.setExporter(exporter)
            const reader = new PeriodicExportingMetricReader({
                exporter: this.parentExporter!,
                exportIntervalMillis: this.metricsExportIntervalMs
            });
            return reader
        } else if (scheme === 'http:' || scheme === 'https:') {
            this.debug(`Creating HTTP reader for endpoint '${url.href}'...`)
            const exporter = new OTLPMetricExporterHTTP({
                url: urlStr,
                headers: httpHeaders,
                temporalityPreference: this.config.getUseCumulativeMetrics() ?
                    sdkMetricsNS.AggregationTemporality.CUMULATIVE :
                    sdkMetricsNS.AggregationTemporality.DELTA
            });
            this.setExporter(exporter)
            const reader = new PeriodicExportingMetricReader({
                exporter: this.parentExporter!,
                exportIntervalMillis: this.metricsExportIntervalMs
            });
            return reader
        } else if (scheme === 'console:') {
            this.debug(`Creating Console reader for endpoint '${url.href}'...`)
            const exporter = new ConsoleMetricExporter()
            this.setExporter(exporter)
            const reader = new PeriodicExportingMetricReader({
                exporter: this.parentExporter!,
                exportIntervalMillis: this.metricsExportIntervalMs
            });
            return reader
        }
        this.warn(`Received bad scheme for metrics: ${scheme}!`)
        return undefined // Unknown
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

    private tearDown(): void {
        for (let reader of this.readers) {
            reader.forceFlush()
            reader.shutdown()
        }
        this.readers = []
    }

    private setup(): void {
        if (this.config.useDebug) {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
        }
        this.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
            const scheme = endpoint.protocol
            const ep = new URL(endpoint.href)
            this.debug(`Connecting to metrics endpoint '${ep.href}'.`)
            ep.protocol = ep.protocol.replace("grpcs:", "https:")
            ep.protocol = ep.protocol.replace("grpc:", "http:")
            var creds: ChannelCredentials | undefined = this.readCredentials(scheme, certFile)
            var headers: Record<string,string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
            if (scheme.startsWith('http')) {
                headers['Content-Type'] = 'application/x-protobuf'
            }
            const reader: PeriodicExportingMetricReader | undefined = this.makeReader(scheme, ep, headers, creds)
            if (reader) { this.readers.push(reader!) }
        })
        this.meterProvider = new MeterProvider({ readers: this.readers, resource: this.resources })
        this.meter = this.meterProvider.getMeter(this.serviceName, this.serviceVersion)
        if (this.config.getUseDebug()) {
            const c = this.meter.createCounter('heartbeat');
            setInterval(() => c.add(1, { demo: 'debug' }), 2_000);
        }
        if (this.meter) {
            this.debug("Meter created successfully.")
        } else {
            this.warn("Meter not created!")
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
