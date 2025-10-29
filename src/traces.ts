// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';

import { type AttrMap, type CarrierMap } from './types.js'
import { Configuration } from './config.js'
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

    constructor(span: Span) {
        this.span = span
        this.span.setStatus({code: SpanStatusCode.OK, message: ""})
    }

    addEvent(name: string, attributes: AttrMap): void {
        this.span.addEvent(name, attributes)
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
    private processors: BatchSpanProcessor[] = []
    private depth: number = 0
    private parentExporter:SpanExporterShim | undefined

    constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes)
        this.setup()
    }

    reinitialize(newAttributes: ResourceAttributes,
                 newEndpoint: URL | undefined = undefined,
                 newToken: string | undefined = undefined
    ): void {
        if (this.depth > 0) {
            throw new Error("TRACE ERROR: The tracing system cannot be re-initialized if inside a trace span!")
        }
        this.tearDown()
        this.makeNewResource(newAttributes)
        if(newEndpoint) {
            this.config.defaultEndpoint = [newEndpoint!, newToken, undefined]
        }
        this.setup()
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
        block(new ASpanImpl(span))
        span.end()
        this.depth--
        this.provider!.forceFlush()
    }

    private setExporter(newExporter: SpanExporter): SpanExporter | undefined {
        if (this.parentExporter == undefined) {
            this.parentExporter = new SpanExporterShim(newExporter)
            return undefined
        } else {
            return this.parentExporter.swapExporter(newExporter)
        }
    }

    makeBatchProcessor(scheme: string, url: URL, httpHeaders: Record<string,string>,
                       creds?: ChannelCredentials): BatchSpanProcessor | undefined {
        var urlStr = url.href
        if (scheme === 'grpc:' || scheme === 'grpcs:') {
            urlStr = `${url.hostname}:${url.port}`
            const exporter = new OTLPTraceExporterGRPC({
                url: urlStr,
                headers: httpHeaders,
                 credentials: creds
            });
            this.setExporter(exporter)
        } else if (scheme === 'http:' || scheme === 'https:') {
            const exporter = new OTLPTraceExporterHTTP({
                url: urlStr,
                headers: httpHeaders
            });
            this.setExporter(exporter)
        } else if (scheme === 'console:') {
            const exporter = new ConsoleSpanExporter()
            this.setExporter(exporter)
        } else if (scheme === 'devnull:') {
            const exporter = new NoopSpanExporter()
            this.setExporter(exporter)
        } else {
            this.warn(`Received bad scheme for tracing: ${scheme}!`)
            return undefined
        }
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

    private tearDown(): void {
        for (let processor of this.processors) {
            processor.forceFlush()
            processor.shutdown()
        }
        this.provider?.shutdown()
        this.provider = null
        this.processors = []
        this.depth = 0
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
        if (processor) { this.processors.push(processor!) }
        this.provider = new NodeTracerProvider({
            spanProcessors: this.processors,
            resource: this.resources
        })
        this.provider!.register()
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
