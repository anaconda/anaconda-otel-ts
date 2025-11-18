// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';

import { type AttrMap, type CarrierMap, TraceArgs, type ASpan } from './types.js'
import { Configuration } from './config.js'
import { ResourceAttributes } from './attributes.js'
import { AnacondaCommon } from "./common.js"
import { SpanExporterShim } from './exporter_shims.js';

// ----- values -----
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

import * as otlpTraceHttpNS from '@opentelemetry/exporter-trace-otlp-http';
const { OTLPTraceExporter: OTLPTraceExporterHTTP } = otlpTraceHttpNS;

import * as otlpTraceGrpcNS from '@opentelemetry/exporter-trace-otlp-grpc';
const { OTLPTraceExporter: OTLPTraceExporterGRPC } = otlpTraceGrpcNS;

import * as sdkTraceBaseNS from '@opentelemetry/sdk-trace-base';
const { ConsoleSpanExporter, BatchSpanProcessor } = sdkTraceBaseNS;

import * as sdkTraceNodeNS from '@opentelemetry/sdk-trace-node';
const { NodeTracerProvider } = sdkTraceNodeNS;

import * as api from '@opentelemetry/api';
const { trace, propagation } = api;

import grpc from '@grpc/grpc-js';
const { ChannelCredentials } = grpc;

// ----- types -----
import type { Span, Context } from '@opentelemetry/api';
import type {
  SpanExporter as _SpanExporter,
  ReadableSpan as _ReadableSpan,
  BatchSpanProcessor as _BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { NodeTracerProvider as _NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { ChannelCredentials as _ChannelCredentials } from '@grpc/grpc-js';

// ----- local type aliases (reuse runtime names) -----
type SpanExporter = _SpanExporter;
type ReadableSpan = _ReadableSpan;
type BatchSpanProcessor = _BatchSpanProcessor;
type NodeTracerProvider = _NodeTracerProvider;
type ChannelCredentials = _ChannelCredentials;

export class ASpanImpl implements ASpan {
    readonly tracer: AnacondaTrace
    readonly ctx: Context;
    readonly span: Span;

    constructor(tracer: AnacondaTrace, ctx: Context, span: Span) {
        this.tracer = tracer
        this.ctx = ctx
        this.span = span
    }

    addEvent(name: string, attributes: AttrMap = {}): this {
        this.span.addEvent(name, attributes)
        return this
    }

    getCurrentCarrier(): CarrierMap {
        let carrier: CarrierMap = {}
        propagation.inject(this.ctx, carrier)
        return carrier
    }

    end(): void {
        this.span.end();
    }
}

export class AnacondaTrace extends AnacondaCommon {
    provider: NodeTracerProvider | null = null
    private processor: BatchSpanProcessor | undefined
    private _tracer: api.Tracer | undefined
    parentExporter: SpanExporterShim | undefined

    get tracer(): api.Tracer {
        if (this._tracer === undefined) {
            this._tracer = trace.getTracer(this.serviceName, this.serviceVersion)
        }
        return this._tracer!
    }

    constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes)
        this.setup()
    }

    async changeConnection(endpoint: URL | undefined, authToken: string | undefined, certFile: string | undefined): Promise<boolean> {
        let [url, token, cert] = this.config.getTraceEndpointTuple()
        if (endpoint !== url && endpoint !== undefined) {
            this.config.traceEndpoint![0] = endpoint
        }
        if (authToken !== token) {
            this.config.traceEndpoint![1] = authToken
        }
        if (certFile !== cert) {
            this.config.traceEndpoint![2] = certFile
        }
        var [scheme, ep] = this.transformURL(this.config.traceEndpoint![0])
        var creds: ChannelCredentials | undefined = this.readCredentials(scheme, this.config.traceEndpoint![2])
        var headers = this.makeHeaders(scheme, authToken)
        var exporter = this.makeExporter(scheme, ep, headers, creds)
        if (exporter === undefined) {
            return false
        }
        await this.processor?.forceFlush()
        var oldExporter = await this.parentExporter?.swapExporter(exporter!)
        await oldExporter?.shutdown()
        return true
    }

    getTrace(name: string, attributes?: AttrMap, carrier?: CarrierMap, parentObject?: ASpan): ASpan {
        let ctx
        if (parentObject) { // Highest precidence if both this and carrier are passed
            ctx = propagation.extract(api.context.active(), parentObject!.getCurrentCarrier())
        } else if (carrier) { // Lowest precidence if both this and parentObject are passed.
            ctx = propagation.extract(api.context.active(), carrier!)
        } else {
            ctx = api.context.active()
        }
        ctx = this.embedUserIdIfMissing(ctx)
        const rootSpan = this.tracer.startSpan(name, {
                attributes: this.makeEventAttributes(attributes)
            }, ctx)
        const ctxWithSpan = trace.setSpan(ctx, rootSpan)

        return new ASpanImpl(this, ctxWithSpan, rootSpan)
    }

    flush(): void {
        this.processor?.forceFlush()
    }

    private embedUserIdIfMissing(ctx: Context): Context {
        const currentBaggage = propagation.getBaggage(ctx)
        if (currentBaggage?.getEntry("user.id")?.value) {
            return ctx
        }
        if (this.attributes.userId === "") {
            return ctx
        }
        let newBaggage: api.Baggage
        if (currentBaggage) {
            newBaggage = currentBaggage.setEntry("user.id", { value: this.attributes.userId })
        } else {
            newBaggage = propagation.createBaggage({ "user.id": { value: this.attributes.userId }})
        }
        return propagation.setBaggage(ctx, newBaggage)
    }

    private makeExporter(scheme: string, url: URL, httpHeaders: Record<string,string>,
                         creds?: ChannelCredentials): SpanExporter | undefined {
        var exporter: SpanExporter | undefined = undefined
        var urlStr = url.href
        if (scheme === 'grpc:' || scheme === 'grpcs:') {
            urlStr = `${url.hostname}:${url.port}`
            exporter = new OTLPTraceExporterGRPC({
                url: urlStr,
                headers: httpHeaders,
                 credentials: creds
            });
        } else if (scheme === 'http:' || scheme === 'https:') {
            exporter = new OTLPTraceExporterHTTP({
                url: urlStr,
                headers: httpHeaders
            });
        } else if (scheme === 'console:') {
            exporter = new ConsoleSpanExporter()
        } else if (scheme === 'devnull:') {
            exporter = new NoopSpanExporter()
        } else {
            this.warn(`Received bad scheme for tracing: ${scheme}!`)
        }
        return exporter
    }

    makeBatchProcessor(scheme: string, url: URL, httpHeaders: Record<string,string>,
                       creds?: ChannelCredentials): BatchSpanProcessor | undefined {
        var exporter = this.makeExporter(scheme, url, httpHeaders, creds)
        if (exporter === undefined) {
            return undefined
        }
        this.parentExporter = new SpanExporterShim(exporter!)
        return new BatchSpanProcessor(this.parentExporter!, {
            scheduledDelayMillis: this.config.getTracesExportIntervalMs()
        })
    }

    readCredentials(scheme: string, certFile?: string): ChannelCredentials | undefined {
        var creds: ChannelCredentials | undefined = undefined
        if (certFile !== undefined && scheme === ("grpcs:")) {
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
        var [endpoint, authToken, certFile] = this.config.getTraceEndpointTuple()
        const scheme = endpoint.protocol
        const ep = new URL(endpoint.href)
        this.debug(`Connecting to traces endpoint '${ep.href}'.`)
        ep.protocol = ep.protocol.replace("grpcs:", "https:")
        ep.protocol = ep.protocol.replace("grpc:", "http:")
        var creds: ChannelCredentials | undefined = this.readCredentials(scheme, certFile)
        const headers: Record<string,string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        const processor: BatchSpanProcessor | undefined = this.makeBatchProcessor(scheme, ep, headers, creds)
        if (processor) {
            this.processor = processor
            this.provider = new NodeTracerProvider({
                spanProcessors: [this.processor],
                resource: this.resources
            })
            this.provider!.register()
        } else {
            console.warn('Failed to create a batch processor for tracing!')
        }
    }
}

export class NoopSpanExporter implements SpanExporter {
    export(_spans: ReadableSpan[], resultCallback: (result: { code: number }) => void): void {
        // Immediately report success without doing anything
        resultCallback({ code: 0 });
    }

    shutdown(): Promise<void> {
        return Promise.resolve();
    }

    forceFlush(): Promise<void> {
        return Promise.resolve();
    }
}
