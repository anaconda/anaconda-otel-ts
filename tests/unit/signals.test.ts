// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { jest, expect, beforeEach } from '@jest/globals';
import { Configuration } from '../../src/config'
import { ResourceAttributes } from '../../src/attributes'
import {
    initializeTelemetry,
    reinitializeTelemetry,
    recordHistogram,
    decrementCounter,
    incrementCounter,
    traceBlock
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

test("initializeTelemetry with metrics only", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])

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

test("initializeTelemetry with traces only", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["tracing"])

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

test("initializeTelemetry with unknown signal type", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    console.warn = jest.fn() // Mock console.warn

    initializeTelemetry(config, attributes, ["unknown"])

    expect(__initialized).toBe(false)
    expect(__metrics).toBeUndefined()
    expect(__tracing).toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
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

test("incrementCounter with metrics initialized then reinitialized", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    initializeTelemetry(config, attributes, ["metrics"])

    var result = incrementCounter({name: "test_counter", forceUpDownCounter: false, by: 5, attributes: { key: "value" }})

    expect(result).toBe(true)

    reinitializeTelemetry(attributes)
    result = incrementCounter({name: "test_counter2", forceUpDownCounter: true, by: 1, attributes: { key: "value2" }})

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

test("traceBlock with tracing initialized", () => {
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")

    const mockBlock = jest.fn((aspan: ASpan) => {
        aspan.addAttributes({ key: "value" })
    })

    initializeTelemetry(config, attributes, ["tracing"])
    traceBlock({name: "test_trace", attributes: { "key": "value" }}, mockBlock)

    expect(mockBlock).toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalledWith("*** Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.")
})

test("traceBlock without tracing initialized", () => {
    const mockBlock = jest.fn((aspan: ASpan) => {
        aspan.addAttributes({ key: "value" })
    })

    traceBlock({name: "test_trace"}, mockBlock)

    expect(mockBlock).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith("*** WARNING: Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.")
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

test("test reinitialize for both", () =>{
    const config = new Configuration().setUseConsoleOutput(true)
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    const newAttributes = new ResourceAttributes("test_service", "0.0.1").setAttributes({userId: "some_user_id"})

    expect(__initialized).toBe(false)
    expect(__metrics).toBeUndefined()
    expect(__tracing).toBeUndefined()

    expect(reinitializeTelemetry(newAttributes)).toBe(false)

    initializeTelemetry(config, attributes, ["metrics", "tracing"])
    expect(__initialized).toBe(true)
    expect(__metrics).toBeDefined()
    expect(__tracing).toBeDefined()

    expect(reinitializeTelemetry(newAttributes)).toBe(true)
})
