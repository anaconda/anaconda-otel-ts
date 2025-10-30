// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { jest, expect, beforeEach } from '@jest/globals';
import { Configuration } from '../../src/config'
import { ResourceAttributes } from '../../src/attributes'
import {
    initializeTelemetry,
    changeSignalConnection,
    recordHistogram,
    decrementCounter,
    incrementCounter,
    traceBlock,
    traceBlockAsync
} from '../../src/signals'
import {
    __resetSignals,
    __initialized,
    __metrics,
    __tracing,
    __noopASpan
} from '../../src/testing-signals.js';
import { type ASpan } from '../../src/traces'

beforeEach(() => {
    jest.clearAllMocks()
    __resetSignals()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
})

test("verify initial state of signals", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    expect(__initialized).toBe(false)
    expect(__metrics).toBeUndefined()
    expect(__tracing).toBeUndefined()
})

test("initializeTelemetry with metrics only", async () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])
    expect(await changeSignalConnection("tracing", new URL("devnull:"))).toBe(false)

    expect(__initialized).toBe(true)
    expect(__metrics).toBeDefined()
    expect(__tracing).toBeUndefined()
})

test("initializeTelemetry with defaults", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes)

    expect(__initialized).toBe(true)
    expect(__metrics).toBeDefined()
    expect(__tracing).toBeUndefined()
})

test("initializeTelemetry with traces only", async () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["tracing"])
    expect(await changeSignalConnection("metrics", new URL("devnull:"))).toBe(false)

    expect(__initialized).toBe(true)
    expect(__metrics).toBeUndefined()
    expect(__tracing).toBeDefined()
})

test("initializeTelemetry with both metrics and traces", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics", "tracing"])

    expect(__initialized).toBe(true)
    expect(__metrics).toBeDefined()
    expect(__tracing).toBeDefined()
})

test("initializeTelemetry with neither metrics or traces", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, [])

    expect(__initialized).toBe(false)
    expect(__metrics).toBeUndefined()
    expect(__tracing).toBeUndefined()
})

test("initializeTelemetry does nothing if already initialized", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])
    const initialMetrics = __metrics

    initializeTelemetry(config, attributes, ["tracing"])

    expect(__initialized).toBe(true)
    expect(__metrics).toBe(initialMetrics) // Should not change
    expect(__tracing).toBeUndefined()
})

test("recordHistogram with metrics initialized", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])

    const result = recordHistogram({name: "test_metric", value: 42, attributes: { key: "value" }})

    expect(result).toBe(true)
})

test("recordHistogram without metrics initialized", () => {
    const result = recordHistogram({name: "test_metric", value: 42})

    expect(result).toBe(false)
    expect(console.warn).toHaveBeenCalledWith("*** WARNING: Metrics not initialized. Call initializeTelemetry first.")
})

test("incrementCounter with metrics initialized", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])

    const result = incrementCounter({name: "test_counter", forceUpDownCounter: false, by: 5, attributes: { key: "value" }})

    expect(result).toBe(true)
})

test("incrementCounter without metrics initialized", () => {
    const result = incrementCounter({name: "test_counter", forceUpDownCounter: false})

    expect(result).toBe(false)
    expect(console.warn).toHaveBeenCalledWith("*** WARNING: Metrics not initialized. Call initializeTelemetry first.")
})

test("decrementCounter with metrics initialized", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])

    const result = decrementCounter({name: "test_counter", by: 3, attributes: { key: "value" }})

    expect(result).toBe(true)
})

test("decrementCounter with metrics initialized but no meter", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])
    __metrics!.meter = null

    const result = decrementCounter({name: "test_counter", by: 3, attributes: { key: "value" }})

    expect(result).toBe(false)
})

test("decrementCounter without metrics initialized", () => {
    const result = decrementCounter({name: "test_counter"})

    expect(result).toBe(false)
    expect(console.warn).toHaveBeenCalledWith("*** WARNING: Metrics not initialized. Call initializeTelemetry first.")
})

test("traceBlock with tracing initialized", async () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["tracing"])
    await traceBlockAsync({name: "test_trace", attributes: { "key": "value" }}, async (aspan: ASpan) => {
        aspan.addAttributes({ key: "value" })
        expect(console.warn).not.toHaveBeenCalledWith("*** Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.")
    })
    traceBlock({name: "test_trace", attributes: { "key": "value" }}, (aspan: ASpan) => {
        aspan.addAttributes({ key: "value" })
        expect(console.warn).not.toHaveBeenCalledWith("*** Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.")
    })
})

test("traceBlock without tracing initialized", async () => {
    const mockBlock = jest.fn((aspan: ASpan) => {
        aspan.addAttributes({ key: "value" })
    })

    traceBlock({name: "test_trace"}, mockBlock)
    expect(mockBlock).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith("*** WARNING: Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.")

    await traceBlockAsync({name: "test_trace"}, async (aspan: ASpan) => {
        expect(console.warn).toHaveBeenCalledWith("*** WARNING: Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.")
    })
})

test("traceBlock with noop span when tracing not initialized", () => {
    const mockBlock = jest.fn((aspan: ASpan) => {
        aspan.addAttributes({ key: "value" })
        aspan.addEvent("test_event", { attr: "value" })
        aspan.addException(new Error("Test error"))
        aspan.setErrorStatus("Test error status")
    })

    traceBlock({name: "test_trace"}, mockBlock)

    expect(mockBlock).toHaveBeenCalledWith(__noopASpan)
    expect(console.warn).toHaveBeenCalledWith("*** WARNING: Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.")
})

test("changeSignalConnection for metrics and tracing", async () => {
    const config = new Configuration()
        .setMetricsEndpoint(new URL("console:"))
        .setTraceEndpoint(new URL("console:"))
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics", "tracing"])

    var metricsUrl = __metrics?.config.getMetricsEndpointTuple()[0]
    var tracingUrl = __tracing?.config.getTraceEndpointTuple()[0]
    var metricsToken = __metrics?.config.getMetricsEndpointTuple()[1]
    var tracingToken = __tracing?.config.getTraceEndpointTuple()[1]
    var metricsFile = __metrics?.config.getMetricsEndpointTuple()[2]
    var tracingFile = __tracing?.config.getTraceEndpointTuple()[2]
    expect(metricsUrl?.href).toBe("console:")
    expect(tracingUrl?.href).toBe("console:")
    expect(metricsToken).toBeUndefined()
    expect(tracingToken).toBeUndefined()
    expect(metricsFile).toBeUndefined()
    expect(tracingFile).toBeUndefined()

    await changeSignalConnection("metrics", new URL("devnull:"))
    await changeSignalConnection("tracing", new URL("devnull:"))
    metricsUrl = __metrics?.config.getMetricsEndpointTuple()[0]
    tracingUrl = __tracing?.config.getTraceEndpointTuple()[0]
    expect(metricsUrl?.href).toBe("devnull:")
    expect(tracingUrl?.href).toBe("devnull:")

    await changeSignalConnection("metrics", undefined, "newAuth1")
    await changeSignalConnection("tracing", undefined, "newAuth2")
    metricsUrl = __metrics?.config.getMetricsEndpointTuple()[0]
    tracingUrl = __tracing?.config.getTraceEndpointTuple()[0]
    metricsToken = __metrics?.config.getMetricsEndpointTuple()[1]
    tracingToken = __tracing?.config.getTraceEndpointTuple()[1]
    expect(metricsUrl?.href).toBe("devnull:")
    expect(tracingUrl?.href).toBe("devnull:")
    expect(metricsToken).toBe("newAuth1")
    expect(tracingToken).toBe("newAuth2")

    await changeSignalConnection("metrics", undefined, undefined, "/tmp/file1")
    await changeSignalConnection("tracing", undefined, undefined, "/tmp/file2")
    metricsUrl = __metrics?.config.getMetricsEndpointTuple()[0]
    tracingUrl = __tracing?.config.getTraceEndpointTuple()[0]
    metricsToken = __metrics?.config.getMetricsEndpointTuple()[1]
    tracingToken = __tracing?.config.getTraceEndpointTuple()[1]
    metricsFile = __metrics?.config.getMetricsEndpointTuple()[2]
    tracingFile = __tracing?.config.getTraceEndpointTuple()[2]
    expect(metricsUrl?.href).toBe("devnull:")
    expect(tracingUrl?.href).toBe("devnull:")
    expect(metricsToken).toBeUndefined()
    expect(tracingToken).toBeUndefined()
    expect(metricsFile).toBe("/tmp/file1")
    expect(tracingFile).toBe("/tmp/file2")

    expect(await changeSignalConnection("metrics", new URL("file:///tmp/file1"))).toBe(false)
    expect(await changeSignalConnection("tracing", new URL("file:///tmp/file1"))).toBe(false)
})
