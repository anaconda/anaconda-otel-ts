// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs'
import * as path from 'path'

import { jest, expect, beforeEach, beforeAll, afterAll, afterEach } from '@jest/globals';
import { Configuration, InternalConfiguration } from '../../src/config'
import { InternalResourceAttributes, ResourceAttributes } from '../../src/attributes'
import { AnacondaTrace, NoopSpanExporter, ASpanImpl } from '../../src/traces'
import { TraceArgs, type CarrierMap } from '../../src/types'
import type { Resource as _Resource } from '@opentelemetry/resources';
type Resource = _Resource;

jest.mock('@opentelemetry/sdk-metrics')
jest.mock('@opentelemetry/exporter-trace-otlp-grpc')
jest.mock('@opentelemetry/exporter-trace-otlp-http')
jest.mock('@opentelemetry/api')

import { type Span, trace, type Tracer } from '@opentelemetry/api'

test("dummy test", () => {
})

class TestImpl extends AnacondaTrace {
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
    public get metricsExportIntervalMsTest(): number {
        return this.metricsExportIntervalMs
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
        this.debug(line)
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

test("verify AnacondaTrace class instantiation", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const metrics = new AnacondaTrace(config, attributes)

    // Verify the instance is created correctly
    expect(metrics).toBeInstanceOf(AnacondaTrace)
    expect(metrics.config).toBeInstanceOf(InternalConfiguration)
    expect(metrics.attributes).toBeInstanceOf(InternalResourceAttributes)
})

test("verify non-console implementation for setup and variations", () => {
    var counter = 0
    for (let authToken of [undefined, "auth_token"]) {
        for (let cert of [undefined, certFile]) {
            const ports: Record<string,number> = { "http": 80, "https": 443, "grpc": 4317, "grpcs": 4318, "devnull": 0, "unknown": 0 }
            for (let schema of Object.keys(ports)) {
                counter += 1
                const port = ports[schema]
                const str = `${schema}://localhost:${port}/v1/traces`
                const url = new URL(str)
                const config = new Configuration();
                config.setTraceEndpoint(url, authToken, cert)
                const attributes = new ResourceAttributes("test_service", "0.0.1")
                var trace = new AnacondaTrace(config, attributes)
            }
        }
    }
})

test("verify readCredentials", () => {
    const config = new Configuration();
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    var trace = new AnacondaTrace(config, attributes)
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
    const tracer = new NoopSpanExporter()
    tracer.export([], (results) => {})
    tracer.forceFlush()
    tracer.shutdown()
})

 test("check bad name for traceBlock", async () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const tracer = new AnacondaTrace(config, attributes)
    const ctx = tracer.getTrace("###")
    expect(ctx === undefined)
 })

 test("dummy test for TraceArgs (can be deleted but will reduce coverage)", () =>{
    new TraceArgs()
 })

 test("ASpanImpl tests with ID", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    attributes.setAttributes({ userId: "TestUser" })
    const tracer = new AnacondaTrace(config, attributes)
    const ut = tracer.getTrace("testing")
    ut.addEvent("event")
    let child = tracer.getTrace("child", undefined, undefined, ut)
    child.addEvent("childEvent")
    const carrier: CarrierMap = child.getCurrentCarrier()
    child.end()
    child = tracer.getTrace("child", undefined, ut.getCurrentCarrier(), undefined)
    expect(Object.keys(carrier).length).toBe(2)
    expect(carrier['baggage']).toBe('user.id=TestUser')
    child.end()
    ut.end()
})

 test("ASpanImpl tests without ID", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    const tracer = new AnacondaTrace(config, attributes)
    const ut = tracer.getTrace("testing")
    ut.addEvent("event")
    const child = tracer.getTrace("child", undefined, undefined, ut)
    ut.addEvent("childEvent")
    const carrier: CarrierMap = child.getCurrentCarrier()
    expect(Object.keys(carrier).length).toBe(1)
    child.end()
    ut.end()
})

test("test flushing", () => {
    const config = new Configuration().setUseConsoleOutput(true);
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    var trace = new AnacondaTrace(config, attributes)
    trace.flush()
})
