// SPDX-FileCopyrightText: 2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { type AttrMap } from './types.js';
import { Configuration, type EndpointTuple } from './config.js';
import { ResourceAttributes } from './attributes.js';
import { AnacondaCommon } from "./common.js";
import { LogRecordExporterShim } from './exporter_shims.js';


// ----- your value imports (keep as-is) -----
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

import { logs, SeverityNumber, type Logger } from '@opentelemetry/api-logs';
import * as httpNS from '@opentelemetry/exporter-logs-otlp-http';
const { OTLPLogExporter: OTLPLogExporterHTTP } = httpNS;


import {
    LoggerProvider,
    type LogRecordExporter,
    type ReadableLogRecord,
    ConsoleLogRecordExporter,
    BatchLogRecordProcessor,
 } from '@opentelemetry/sdk-logs';
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';

// ----- local type aliases that REUSE the value names -----

/**
 * Arguments for calls to any log methods. See documentation for ATelLogger.
 */
export class LogArgs {
    message: string = "<No Log Message>";
    attributes?: AttrMap = {};
};

enum LogLevel {
    UNSPECIFIED = 0,
    TRACE = 1,
    DEBUG = 5,
    INFO = 9,
    WARN = 13,
    ERROR = 17,
    FATAL = 21
};

const _conversionMap: Record<LogLevel,SeverityNumber> = {
    [LogLevel.UNSPECIFIED]: SeverityNumber.UNSPECIFIED,
    [LogLevel.TRACE]: SeverityNumber.TRACE,
    [LogLevel.DEBUG]: SeverityNumber.DEBUG,
    [LogLevel.INFO]: SeverityNumber.INFO,
    [LogLevel.WARN]: SeverityNumber.WARN,
    [LogLevel.ERROR]: SeverityNumber.ERROR,
    [LogLevel.FATAL]: SeverityNumber.FATAL
};
const _nameMap: Record<LogLevel,string> = {
    [LogLevel.UNSPECIFIED]: "UNSPECIFIED",
    [LogLevel.TRACE]: "TRACE",
    [LogLevel.DEBUG]: "DEBUG",
    [LogLevel.INFO]: "INFO",
    [LogLevel.WARN]: "WARN",
    [LogLevel.ERROR]: "ERROR",
    [LogLevel.FATAL]: "FATAL"
};

/**
 * Arguments for calls to sendEvent(). See sendEvent documentation.
 */
export class EventArgs {
    eventName: string = "<missing_event_name>>";
    payload: Record<string,any> = {};
    attributes?: AttrMap = {};
};

export interface ATelLogger {
    trace(args: LogArgs): void;
    debug(args: LogArgs): void;
    info(args: LogArgs): void;
    warn(args: LogArgs): void;
    error(args: LogArgs): void;
    fatal(args: LogArgs): void;
    sendEvent(args: EventArgs): void;
};

export class AnacondaLogging extends AnacondaCommon implements ATelLogger {
    provider: LoggerProvider | null = null
    private processor: BatchLogRecordProcessor | undefined
    private _logger: Logger | undefined = undefined
    parentExporter: LogRecordExporterShim | undefined = undefined

    constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes);
        if (this.isValidOtelUrl(this.config.getLoggingEndpointTuple()[0].href) === false) {
            console.error(`The logs endpoint URL is not valid: ${this.config.getLoggingEndpointTuple()[0].href}`)
            return
        }
        this.setup()
    }

    trace(args: LogArgs): void {
        this.log(LogLevel.TRACE, args)
    }

    debug(args: LogArgs): void {
        this.log(LogLevel.DEBUG, args)
    }

    info(args: LogArgs): void {
        this.log(LogLevel.INFO, args)
    }

    warn(args: LogArgs): void {
        this.log(LogLevel.WARN, args)
    }

    error(args: LogArgs): void {
        this.log(LogLevel.ERROR, args)
    }

    fatal(args: LogArgs): void {
        this.log(LogLevel.FATAL, args)
    }

    private log(level: LogLevel, args: LogArgs): void {
        this.internalSendEvent("__LOG__", level, args.message, args.attributes)
    }

    sendEvent(args: EventArgs): void {
        let json = JSON.stringify(args.payload);
        this.internalSendEvent(args.eventName, LogLevel.UNSPECIFIED, json, args.attributes)
    }

    getLogger(): ATelLogger {
        return this
    }

    async flush(): Promise<void> {
        try {
            await this.processor?.forceFlush()
        } catch (error) {
            // Log export failures instead of crashing the application
            // This matches Python SDK behavior where export failures are logged
            this._warn(`Logging export failed: ${this.errorMessage(error)}`)
        }
    }

    async changeConnection(endpoint: URL | undefined, authToken: string | undefined,
                           certFile: string | undefined, userId: string | undefined): Promise<boolean> {
        if (endpoint && this.isValidOtelUrl(endpoint!.href) === false) {
            console.error(`The logs endpoint URL is not valid: ${endpoint!.href}`)
            return false
        }
        let [url, token, cert] = this.config.getLoggingEndpointTuple()
        if (endpoint !== url && endpoint !== undefined) {
            this.config.loggingEndpoint![0] = endpoint
        }
        if (authToken !== token) {
            this.config.loggingEndpoint![1] = authToken
        }
        if (certFile !== cert) {
            this.config.loggingEndpoint![2] = certFile
        }
        let id = userId?.trim()
        if (typeof id === 'string' && id.length > 0) {
            this.attributes.userId = id
        }
        var [scheme, ep] = this.transformURL(this.config.loggingEndpoint![0])
        var headers = this.makeHeaders(scheme, authToken)
        var exporter = this.makeExporter(scheme, ep, headers)
        if (exporter === undefined) {
            return false
        }
        await this.processor?.forceFlush()
        var oldExporter = await this.parentExporter?.swapExporter(exporter!)
        await oldExporter?.shutdown()
        return true
    }

    private internalSendEvent(name: string, level: LogLevel, payloadStr: string, attributes?: AttrMap): void {
        if (this._logger === undefined) { console.warn("### ERROR: No Logger!!!"); return }
        let severity = _conversionMap[level]
        let severityName = _nameMap[level]
        let updatedAttributes = this.makeEventAttributes(attributes)
        updatedAttributes['log.event.name'] = name
        let record = {
            severityNumber: severity,
            severityText: severityName,
            eventName: name,
            body: payloadStr,
            attributes: updatedAttributes
        }
        this._logger?.emit(record)
    }

    private setup(): void {
        if (this.config.useDebug) {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
        }
        var [endpoint, authToken, certFile] = this.config.getLoggingEndpointTuple()
        if (!this.isValidOtelUrl(endpoint.href)) {
            console.error(`The logs endpoint URL is not valid: ${endpoint.href}`)
            return
        }
        const scheme = endpoint.protocol
        const ep = new URL(endpoint.href)
        this._debug(`Connecting to logging endpoint '${ep.href}'.`)
        const headers: Record<string,string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        const processor: BatchLogRecordProcessor | undefined = this.makeBatchProcessor(scheme, ep, headers)
        if (processor) {
            this.processor = processor
            this.provider = new LoggerProvider({
                resource: this.resources,
                processors: [this.processor],
                logRecordLimits: {
                    attributeCountLimit: 150, // no more than 150 keys in attributes...
                    attributeValueLengthLimit: 4096, // A key's value must not exceed this in bytes.
                }
            })
            logs.setGlobalLoggerProvider(this.provider!);
            this._logger = logs.getLogger(this.attributes.getServiceName())
        } else {
            console.warn('Failed to create a batch processor for logging!')
        }
    }


    makeBatchProcessor(scheme: string, url: URL, httpHeaders: Record<string,string>,
): BatchLogRecordProcessor | undefined {
        var exporter = this.makeExporter(scheme, url, httpHeaders)
        if (exporter === undefined) {
            return undefined
        }
        this.parentExporter = new LogRecordExporterShim(exporter!)
        return new BatchLogRecordProcessor(this.parentExporter!, {
            scheduledDelayMillis: this.config.getLoggingExportIntervalMs()
        })
    }

    private makeExporter(scheme: string, url: URL, httpHeaders: Record<string,string>): LogRecordExporter | undefined {
        var exporter: LogRecordExporter | undefined = undefined
        var urlStr = url.href
        this._debug(`Creating log exporter at endpoint ${urlStr}`)
        if (scheme === 'grpc:' || scheme === 'grpcs:') {
            this._warn(`GRPC endpoints are no longer supported. Please use HTTP/HTTPS endpoints instead: ${urlStr}`)
            return undefined
        } else if (scheme === 'http:' || scheme === 'https:') {
            exporter = new OTLPLogExporterHTTP({
                url: urlStr,
                headers: httpHeaders
            });
        } else if (scheme === 'console:') {
            exporter = new ConsoleLogRecordExporter()
        } else if (scheme === 'devnull:') {
            exporter = new NoopLogExporter()
        } else {
            this._warn(`Received bad scheme for logging: ${scheme}!`)
        }
        return exporter
    }
}

export class NoopLogExporter implements LogRecordExporter {
    constructor(_options?: any) {}

    export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
        resultCallback({ code: 0 });
    }

    async shutdown(): Promise<void> {
        return Promise.resolve();
    }

    async forceFlush(): Promise<void> {
        return Promise.resolve();
    }
}
