// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs'
import * as path from 'path'

import { Configuration, InternalConfiguration } from '../../src/config'
import { InternalResourceAttributes, ResourceAttributes } from '../../src/attributes'
import { AnacondaTrace, ASpanImpl, LocalContext, NoopSpanExporter, ASpan, TraceArgs } from '../../src/traces'

jest.mock('@opentelemetry/sdk-metrics')
jest.mock('@opentelemetry/exporter-trace-otlp-grpc')
jest.mock('@opentelemetry/exporter-trace-otlp-http')
jest.mock('@opentelemetry/api')

import { Span, trace, Tracer } from '@opentelemetry/api'

const mockedSpan: jest.Mocked<Span> = {
    spanContext: jest.fn(),
    setAttribute: jest.fn(),
    setAttributes: jest.fn(),
    addEvent: jest.fn(),
    setStatus: jest.fn(),
    updateName: jest.fn(),
    end: jest.fn(),
    isRecording: jest.fn(),
    recordException: jest.fn(),
    addLink: jest.fn(),
    addLinks: jest.fn(),
}

var certFile: string
beforeEach(() => {
    certFile = path.join(process.cwd(), "testFile2.cert")
    fs.writeFileSync(certFile, "Example Cert File 2")
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    if (fs.existsSync(certFile)) {
        fs.unlinkSync(certFile)
    }
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
    for (let attr of [undefined, new ResourceAttributes("test_name", "0.0.0")]) {
        var ut = new ASpanImpl(mockedSpan)
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

test("verify failure to reinitialize inside a traceblock", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const tracer = new AnacondaTrace(config, attributes)

    // Verify the instance is created correctly
    expect(tracer).toBeInstanceOf(AnacondaTrace)
    expect(tracer.config).toBeInstanceOf(InternalConfiguration)
    expect(tracer.attributes).toBeInstanceOf(InternalResourceAttributes)

    const mockTracer = {
        startSpan: jest.fn().mockReturnValue(mockedSpan)
    } as unknown as Tracer;

    const spy = jest.spyOn(trace, 'getTracer').mockReturnValue(mockTracer);
    tracer.traceBlock({name: "test_trace"}, (span: ASpan) => {
        try {
            const newAttr = new ResourceAttributes("test_service", "0.0.1").setAttributes({ userId: "some user"})
            tracer.reinitialize(newAttr)
            expect(true).toBe(false)
        } catch (error) {
            const err = error as Error
            expect(err.message).toBeDefined()
            expect(err.message!).toBe("TRACE ERROR: The tracing system cannot be re-initialized if inside a trace span!")
        }
    })
 })

 test("check bad name for traceBlock", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    // Create an instance of AnacondaMetrics
    const tracer = new AnacondaTrace(config, attributes)
    try {
        tracer.traceBlock({name: "###"}, (span) => {
            console.debug("Should never output...")
        })
    } catch (err) {
        const error = err as Error
        expect(error.message).toBe("Trace name '###' is not a valid name (^[A-Za-z][A-Za-z_0-9]+$).")
    }
 })

 test("dummy test for TraceArgs (can be deleted but will reduce coverage)", () =>{
    const args = new TraceArgs()
 })
