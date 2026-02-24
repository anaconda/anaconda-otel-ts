// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs'
import * as path from 'path'

import { jest, expect, beforeEach, beforeAll, afterAll, afterEach } from '@jest/globals';
import { Configuration, InternalConfiguration } from '../../src/config'
import { InternalResourceAttributes, ResourceAttributes } from '../../src/attributes'
import { AnacondaLogging, LogArgs, EventArgs, NoopLogExporter } from '../../src/logging'
import type { Resource as _Resource } from '@opentelemetry/resources';
type Resource = _Resource;

jest.mock('@opentelemetry/sdk-logs')
jest.mock('@opentelemetry/exporter-logs-otlp-grpc')
jest.mock('@opentelemetry/exporter-logs-otlp-http')
jest.mock('@opentelemetry/api')


class TestImpl extends AnacondaLogging {
    public constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes)
    }

    public getConfig(): InternalConfiguration {
        return this.config
    }
    public getAttributes(): InternalResourceAttributes {
        return this.attributes;
    }
    public getResources(): Resource {
        return this.resources
    }
    public get serviceNameTest(): string {
        return this.serviceName
    }
    public get serviceVersionTest(): string {
        return this.serviceVersion
    }
    public get useConsoleTest(): boolean {
        return this.useConsole
    }
    public get loggingExportIntervalMsTest(): number {
        return this.loggingExportIntervalMs
    }
    public get skipInternetCheckTest(): boolean {
        return this.skipInternetCheck
    }
    public readCertFileTest(certFile: string): string | undefined {
        return this.readCertFile(certFile)
    }

    public testDebug(line: string) {
        var saved = console.debug
        console.debug = jest.fn()
        this._debug(line)
        console.debug = saved
    }

    public testMakeNewResources(newAttributes: ResourceAttributes): void {
        this.makeNewResource(newAttributes)
    }
}

var certFile: string
beforeAll(() => {
    certFile = path.join("testFile2.cert")
    fs.writeFileSync(certFile, "Example Cert File 2")
})

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
    if (fs.existsSync(certFile)) {
        fs.unlinkSync(certFile)
    }
})

afterEach(() => {
    jest.restoreAllMocks()
})

test("verify AnacondaLogging class instantiation", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const logging = new TestImpl(config, attributes)

    // Verify the instance is created correctly
    expect(logging).toBeInstanceOf(AnacondaLogging)
    expect(logging.config).toBeInstanceOf(InternalConfiguration)
    expect(logging.attributes).toBeInstanceOf(InternalResourceAttributes)
})

test("verify non-console implementation for setup and variations", () => {
    var counter = 0
    for (let authToken of [undefined, "auth_token"]) {
        for (let cert of [undefined, certFile]) {
            const ports: Record<string,number> = { "http": 80, "https": 443, "grpc": 4317, "grpcs": 4318, "devnull": 0, "unknown": 0 }
            for (let schema of Object.keys(ports)) {
                counter += 1
                const port = ports[schema]
                const path = schema.startsWith("grpc") ? "/" : "/v1/logs"
                const str = (schema === "devnull" || schema === "unknown") ? `${schema}:` : `${schema}://localhost:${port}${path}`
                const url = new URL(str)
                const config = new Configuration();
                config.setLoggingEndpoint(url, authToken, cert)
                const attributes = new ResourceAttributes("test_service", "0.0.1")
                var trace = new AnacondaLogging(config, attributes)
            }
        }
    }
})

test("verify readCredentials", () => {
    const config = new Configuration().setDebugState(true);
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    var trace = new AnacondaLogging(config, attributes)
    for (let file of [undefined, certFile]) {
        for (let scheme of ["https:", "grpcs:"]) {
            const result = trace.readCredentials(scheme, file)
            if (file && scheme === "grpcs:") {
                expect(result).toBeDefined()
            } else {
                expect(result).toBeUndefined()
            }
        }
    }
    expect(trace.readCredentials("grpcs:", "/tmp/doesnt_exist")).toBeUndefined()
})

test("test NoOp exporter", () => {
    const tracer = new NoopLogExporter()
    tracer.export([], (results) => {})
    tracer.forceFlush()
    tracer.shutdown()
})

test("Test logger", () => {
    const config = new Configuration().setLoggingEndpoint(new URL("devnull:"));
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    var logging = new AnacondaLogging(config, attributes)
    var logger = logging.getLogger()
    logger.trace({message: "!!! TRACE"})
    logger.debug({message: "!!! DEBUG"})
    logger.info({message: "!!! INFO"})
    logger.warn({message: "!!! WARN"})
    logger.error({message: "!!! ERROR"})
    logger.fatal({message: "!!! FATAL"})
    logging.flush()
})

test("Test debug mode", () => {
    const config = new Configuration()
        .setLoggingEndpoint(new URL("devnull:"))
        .setDebugState(true);
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    var logging = new AnacondaLogging(config, attributes)
    expect(logging.config.useDebug).toBe(true)
})

test("Test argument objects", () => { // Doesn't improve coverage???
    var args: LogArgs = {message: "msg"}
    expect(args.message).toBe("msg")
    expect(args.attributes).toBeUndefined()
    args = {message: "new", attributes: {"key": "value"}}
    expect(args.message).toBe("new")
    expect(args.attributes).toStrictEqual({"key": "value"})
    var eargs: EventArgs = {eventName: "test", payload: {"key": "value"}}
    expect(eargs.eventName).toBe("test")
    expect(eargs.payload).toStrictEqual({"key": "value"})
    expect(eargs.attributes).toBeUndefined()
    eargs = {eventName: "test", payload: {"key": "value"}, attributes: {}}
    expect(eargs.eventName).toBe("test")
    expect(eargs.payload).toStrictEqual({"key": "value"})
    expect(eargs.attributes).toStrictEqual({})
})

test("Test bad changeConnection URL", async () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const logger = new AnacondaLogging(config, attributes)

    const rv = await logger.changeConnection(new URL("ftp://somehost.domain:34545/"), undefined, undefined, undefined)
    expect(rv).toBe(false)
})

test("test adding a new user id", async () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const logger = new AnacondaLogging(config, attributes)

    try {
        const rv = await logger.changeConnection(undefined, undefined, undefined, "newUser")
    } catch {}
    expect(logger.attributes.userId).toBe("newUser")
})

test("test objects", () => {
    const obj1 = new LogArgs()
    obj1.message = "New Message"
    obj1.attributes = {"key":"value"}
    expect(obj1.message).toBe("New Message")
    expect(obj1.attributes!).toStrictEqual({"key":"value"})

    const obj2 = new EventArgs()
    obj2.eventName = "MyEvent"
    obj2.payload = {}
    obj2.attributes = {"key":"value"}
    expect(obj2.eventName).toBe("MyEvent")
    expect(obj2.attributes!).toStrictEqual({"key":"value"})
    expect(obj2.payload).toStrictEqual({})
})
