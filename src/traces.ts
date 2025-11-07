// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';

import { type AttrMap, type CarrierMap } from './types.js'
import { Configuration, type EndpointTuple } from './config.js'
import { ResourceAttributes } from './attributes.js'
import { AnacondaCommon } from "./common.js"
import { __noopASpan } from './signals-state.js'
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

import * as apiNS from '@opentelemetry/api';
const { SpanStatusCode, trace } = apiNS;

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

export class TraceArgs {
    name: string = "";
    attributes?: AttrMap = {};
    carrier?: CarrierMap = {};
}

/**
 * Represents a span in a tracing system, providing methods to record events, exceptions, errors, and attributes.
 *
 * @remarks
 * This interface is typically used to instrument code for distributed tracing, allowing you to annotate spans with additional information.
 */
export interface ASpan {
    /**
     * Adds an event with the specified name and optional attributes.
     *
     * @param name - The name of the event to add.
     * @param attributes - Optional key-value pairs providing additional information about the event.
     */
    addEvent(name: string, attributes?: AttrMap): void;

    /**
     * Adds an exception to the current context.
     *
     * @param exception - The error object to be added as an exception.
     */
    addException(exception: Error): void;

    /**
     * Sets the error status for the current signal.
     *
     * @param msg - Optional error message describing the reason for the error status.
     */
    setErrorStatus(msg?: string): void;

    /**
     * Adds the specified attributes to the current object.
     *
     * @param attributes - A record containing key-value pairs of attributes to add.
     */
    addAttributes(attributes: AttrMap): void;
}

export class ASpanImpl implements ASpan {
    private span: Span
    private common: AnacondaCommon

    constructor(span: Span, parent: AnacondaCommon) {
        this.span = span
        this.common = parent
        this.span.setStatus({code: SpanStatusCode.OK, message: ""})
    }

    addEvent(name: string, attributes: AttrMap): void {
        this.span.addEvent(name, this.common.makeEventAttributes(attributes))
    }

    addException(exception: Error): void {
        this.span.recordException(exception)
    }

    setErrorStatus(msg?: string): void {
        this.span.setStatus({code: SpanStatusCode.ERROR, message: "The trace code block recorded an error."})
    }

    addAttributes(attributes: AttrMap): void {
        for (let key of Object.keys(attributes)) {
            this.span.setAttribute(key, attributes[key])
        }
    }
}

export class AnacondaTrace extends AnacondaCommon {
    provider: NodeTracerProvider | null = null
    private processor: BatchSpanProcessor | undefined
    private depth: number = 0
    parentExporter:SpanExporterShim | undefined

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

    traceBlock(args: TraceArgs, block: (span: ASpan) => void): void {
        if (!this.isValidName(args.name)) {
            throw Error(`Trace name '${args.name}' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).`)
        }
        const tracer = trace.getTracer(this.serviceName, this.serviceVersion);
        const context: Context = this.convertToContext(args.carrier!)
        const span = tracer.startSpan(args.name, undefined, context)
        this.depth++
        for (let key of Object.keys(args.attributes ? args.attributes : {})) {
            span.setAttribute(key, args.attributes![key])
        }
        block(new ASpanImpl(span, this))
        span.end()
        this.depth--
        this.provider!.forceFlush()
    }

    async traceBlockAsync(args: TraceArgs, block: (span: ASpan) => Promise<void>): Promise<void> {
        if (!this.isValidName(args.name)) {
            throw Error(`Trace name '${args.name}' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).`)
        }
        const tracer = trace.getTracer(this.serviceName, this.serviceVersion);
        const context: Context = this.convertToContext(args.carrier!)
        const span = tracer.startSpan(args.name, undefined, context)
        this.depth++
        for (let key of Object.keys(args.attributes ? args.attributes : {})) {
            span.setAttribute(key, args.attributes![key])
        }
        block(new ASpanImpl(span, this))
        span.end()
        this.depth--
        await this.provider!.forceFlush()
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
        return new BatchSpanProcessor(this.parentExporter!)
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

        }
    }

    private convertToContext(carrier: CarrierMap): Context {
        return new LocalContext(carrier)
    }
}

export class LocalContext implements Context {
    map: Record<symbol, unknown> = {}
    constructor(carrier: CarrierMap) {
        for (let key of Object.keys(carrier ? carrier : {})) {
            this.map[Symbol(key)] = carrier[key]
        }
    }
    getValue(key: symbol): unknown {
        return this.map[key]
    }
    setValue(key: symbol, value: unknown): Context {
        this.map[key] = value
        return this
    }
    deleteValue(key: symbol): Context {
        delete this.map[key]
        return this
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
