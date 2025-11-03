// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs'
import * as path from 'path'

import { jest, expect, beforeEach, beforeAll, afterAll, afterEach } from '@jest/globals';
import { Configuration, InternalConfiguration } from '../../src/config'
import { InternalResourceAttributes, ResourceAttributes } from '../../src/attributes'
import { AnacondaTrace, ASpanImpl, LocalContext, NoopSpanExporter, type ASpan, TraceArgs } from '../../src/traces'
import { AnacondaCommon } from '../../src/common';

jest.mock('@opentelemetry/sdk-metrics')
jest.mock('@opentelemetry/exporter-trace-otlp-grpc')
jest.mock('@opentelemetry/exporter-trace-otlp-http')
jest.mock('@opentelemetry/api')

import { type Span, trace, type Tracer } from '@opentelemetry/api'

class TestImpl extends AnacondaCommon {
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

export const mockedSpan = (() => {
  const span: any = {};

  // non-chain methods / values
  span.spanContext = jest.fn(() => ({
    traceId: '00000000000000000000000000000001',
    spanId:   '0000000000000001',
    traceFlags: 1,
  }));
  span.isRecording     = jest.fn(() => true);
  span.end             = jest.fn();
  span.recordException = jest.fn();

  // chainable methods — return the same span
  span.setAttribute = jest.fn().mockReturnThis();
  span.setAttributes = jest.fn().mockReturnThis();
  span.addEvent = jest.fn().mockReturnThis();
  span.setStatus = jest.fn().mockReturnThis();
  span.updateName = jest.fn().mockReturnThis();

  return span as unknown as jest.Mocked<Span>;
})();

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

 test("verify ASPan methods", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    const impl = new TestImpl(config, attributes)
    for (let attr of [undefined, new ResourceAttributes("test_name", "0.0.0")]) {
        var ut = new ASpanImpl(mockedSpan, impl)
        ut.addAttributes({})
        ut.addEvent("test_event", {})
        ut.addException(new Error("Test Error"))
        ut.setErrorStatus("test status")
    }
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

test("test context implementation", () => {
    const context = new LocalContext({"answer": "42"});
    var newKey: symbol = Symbol("year")
    context.setValue(newKey, "1999")
    expect(Object.getOwnPropertySymbols(context.map).length).toBe(2) // This may be causing random failures...watch it!
    var count = 0
    for (const key of Object.getOwnPropertySymbols(context.map)) {
        if (key === newKey) {
            expect(context.map[key]).toBe("1999")
        } else {
            expect(context.map[key]).toBe("42")
        }
        count++
    }
    context.deleteValue(newKey)
    expect(Object.getOwnPropertySymbols(context.map).length).toBe(1) // This may be causing random failures...watch it!
})

 test("check bad name for traceBlock", async () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const tracer = new AnacondaTrace(config, attributes)
    tracer.traceBlockAsync({name: "###"}, async (span) => {
        console.debug("Should never output...")
    }).catch((err) => {
        const error = err as Error
        expect(error.message).toBe("Trace name '###' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).")
    })
    try {
        tracer.traceBlock({name: "###"}, (span) => {
            console.debug("Should never output...")
        })
    } catch(err) {
        const error = err as Error
        expect(error.message).toBe("Trace name '###' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).")
    }
 })

 test("dummy test for TraceArgs (can be deleted but will reduce coverage)", () =>{
    const args = new TraceArgs()
 })
