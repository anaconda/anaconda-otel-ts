// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { AttrMap } from './types';
import { Configuration } from './config';
import { ResourceAttributes } from './attributes';
import { AnacondaCommon } from "./common";

import { metrics, Meter, UpDownCounter, Counter, Histogram } from '@opentelemetry/api';
import { OTLPMetricExporter as OTLPMetricExporterHTTP } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporter as OTLPMetricExporterGRPC } from '@opentelemetry/exporter-metrics-otlp-grpc';
import {
    MeterProvider,
    PeriodicExportingMetricReader,
    ConsoleMetricExporter,
    PushMetricExporter,
    ResourceMetrics
} from '@opentelemetry/sdk-metrics';
import { ChannelCredentials } from '@grpc/grpc-js';

type ExporterConstructor = new (...args: any[]) => PushMetricExporter;

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

    constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes);
        this.setup()
    }

    reinitialize(newAttributes: ResourceAttributes): void {
        this.tearDown()
        this.makeNewResource(newAttributes)
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
        this.debug(`On call histogram is of type 'Histogram'...`)
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
        this.debug(`On call ${isUpDown ? "up down " : ""}counter is of type '${isUpDown ? "UpDownCounter" : "Counter"}'...`)
        counter.add(Math.abs(args.by!), args.attributes!)
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
        this.debug(`On call counter is of type '${counter.constructor.name}'...`)
        counter.add(-Math.abs(args.by!), args.attributes!)
        return true
    }

    private readonly schemeToExporter: Record<string, ExporterConstructor> = {
        "console:": ConsoleMetricExporter,
        "http:": OTLPMetricExporterHTTP,
        "https:": OTLPMetricExporterHTTP,
        "grpc:": OTLPMetricExporterGRPC,
        "grpcs:": OTLPMetricExporterGRPC,
        "devnull:": NoopMetricExporter
    }

    private makeReader(scheme: string, url: string, headers: Record<string,String>, creds?: ChannelCredentials): PeriodicExportingMetricReader | undefined {
        if (!(scheme in this.schemeToExporter)) { return undefined }
        const ExporterType = this.schemeToExporter[scheme]
        const exporter = new ExporterType({
            url:url,
            headers: headers,
            credentials: creds,
            temporalityPreference: this.config.getUseCumulativeMetrics() ? "CUMULATIVE" : "DELTA"
        });
        const reader = new PeriodicExportingMetricReader({
            exporter,
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

    private tearDown(): void {
        for (let reader of this.readers) {
            reader.forceFlush()
            reader.shutdown()
        }
        this.readers = []
    }

    private setup(): void {
        this.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
            this.debug(`Connecting to endpoint '${endpoint.href}'...`)
            const scheme = endpoint.protocol
            const ep = new URL(endpoint.href)
            ep.protocol = ep.protocol.replace("grpcs:", "https:")
            ep.protocol = ep.protocol.replace("grpc:", "http:")
            var creds: ChannelCredentials | undefined = this.readCredentials(scheme, certFile)
            const headers: Record<string,string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
            const reader: PeriodicExportingMetricReader | undefined = this.makeReader(scheme, ep.href, headers, creds)
            if (reader) { this.readers.push(reader!) }
        })
        this.meterProvider = new MeterProvider({ readers: this.readers, resource: this.resources })
        this.meter = this.meterProvider.getMeter(this.serviceName, this.serviceVersion)
        if (this.meter) {
            this.debug("Meter created successfully.")
        } else {
            this.warn("Meter not created!")
        }
    }

    private getCounter(metricName: string, forceUpDownCounter: boolean): [UpDownCounter | Counter, boolean] {
        if (metricName in this.mapOfCounters) {
            this.debug(`Metric counter name '${metricName}' found.`)
            return this.mapOfCounters[metricName]
        }
        var counter: Counter | UpDownCounter
        if (forceUpDownCounter) {
            counter = this.meter!.createUpDownCounter(metricName)
        } else {
            counter = this.meter!.createCounter(metricName)
        }
        this.debug(`Metric ${forceUpDownCounter ? "up down " : ""}counter name '${metricName}' created with type 'UpDownCounter'.`)
        this.mapOfCounters[metricName] = [counter, forceUpDownCounter]
        return [counter, forceUpDownCounter]
    }

    private getHistogram(metricName: string): Histogram {
        if (metricName in this.mapOfHistograms) {
            this.debug(`Metric histogram name '${metricName}' found.`)
            return this.mapOfHistograms[metricName]
        }
        var histogram: Histogram = this.meter!.createHistogram(metricName)
        this.debug(`Metric histogram name '${metricName}' created with type '${histogram.constructor.name}'.`)
        this.mapOfHistograms[metricName] = histogram
        return histogram
    }
}

export class NoopMetricExporter implements PushMetricExporter {
    constructor(_options?: any) {}

    export(_metrics: ResourceMetrics, resultCallback: (result: { code: number }) => void): void {
        resultCallback({ code: 0 });
    }

    shutdown(): Promise<void> {
        return Promise.resolve();
    }

    forceFlush(): Promise<void> {
        return Promise.resolve();
    }
}
