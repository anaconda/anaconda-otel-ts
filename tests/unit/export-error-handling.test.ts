// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for graceful handling of export errors (404, network failures, etc.)
 *
 * This test suite verifies that the SDK handles export failures gracefully
 * by logging warnings instead of crashing the application. This matches
 * the behavior of the Python SDK.
 */

import { jest, expect, describe, test, beforeEach, afterEach } from '@jest/globals';
import { Configuration } from '../../src/config';
import { ResourceAttributes } from '../../src/attributes';
import {
    initializeTelemetry,
    incrementCounter,
    getTrace,
    flushAllSignals
} from '../../src/signals';
import {
    __resetSignals,
    __initialized,
    __metrics,
    __tracing
} from '../../src/testing-signals.js';

// Mock console methods
let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

beforeEach(() => {
    jest.clearAllMocks();
    __resetSignals();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
});

describe('Export Error Handling', () => {
    test('flushAllSignals should handle trace export failures gracefully', async () => {
        // Initialize with console output (won't fail)
        const config = new Configuration().setUseConsoleOutput(true);
        const attributes = new ResourceAttributes("test_service", "0.0.1");

        initializeTelemetry(config, attributes, ["metrics", "tracing"]);

        expect(__initialized).toBe(true);
        expect(__metrics).toBeDefined();
        expect(__tracing).toBeDefined();

        // Create a span
        const span = getTrace("test-span");
        expect(span).toBeDefined();
        span?.end();

        // Increment a counter
        incrementCounter({ name: "test-counter" });

        // Mock the processor's forceFlush to simulate 404 error for traces
        const mockError = new Error('Not Found');
        if (__tracing && __tracing['processor']) {
            const processor = __tracing['processor'] as any;
            jest.spyOn(processor, 'forceFlush').mockRejectedValue(mockError);
        }

        // flushAllSignals should complete without throwing
        await expect(flushAllSignals()).resolves.not.toThrow();

        // Verify that the error was logged as a warning
        expect(consoleWarnSpy).toHaveBeenCalled();
        const warnCalls = consoleWarnSpy.mock.calls.flat().join(' ');
        expect(warnCalls).toContain('Trace export failed');
        expect(warnCalls).toContain('Not Found');
    });

    test('flushAllSignals should handle metric export failures gracefully', async () => {
        // Initialize with console output
        const config = new Configuration().setUseConsoleOutput(true);
        const attributes = new ResourceAttributes("test_service", "0.0.1");

        initializeTelemetry(config, attributes, ["metrics", "tracing"]);

        expect(__initialized).toBe(true);
        expect(__metrics).toBeDefined();

        // Increment a counter
        incrementCounter({ name: "test-counter" });

        // Mock the reader's forceFlush to simulate network error for metrics
        const mockError = new Error('Network timeout');
        if (__metrics && __metrics['reader']) {
            const reader = __metrics['reader'] as any;
            jest.spyOn(reader, 'forceFlush').mockRejectedValue(mockError);
        }

        // flushAllSignals should complete without throwing
        await expect(flushAllSignals()).resolves.not.toThrow();

        // Verify that the error was logged as a warning
        expect(consoleWarnSpy).toHaveBeenCalled();
        const warnCalls = consoleWarnSpy.mock.calls.flat().join(' ');
        expect(warnCalls).toContain('Metric export failed');
        expect(warnCalls).toContain('Network timeout');
    });

    test('flushAllSignals should handle both metrics and trace failures', async () => {
        // Initialize with console output
        const config = new Configuration().setUseConsoleOutput(true);
        const attributes = new ResourceAttributes("test_service", "0.0.1");

        initializeTelemetry(config, attributes, ["metrics", "tracing"]);

        expect(__initialized).toBe(true);
        expect(__metrics).toBeDefined();
        expect(__tracing).toBeDefined();

        // Create telemetry data
        incrementCounter({ name: "test-counter" });
        const span = getTrace("test-span");
        span?.end();

        // Mock both processor/reader to fail
        const metricsError = new Error('Metrics 404');
        const tracesError = new Error('Traces 404');

        if (__metrics && __metrics['reader']) {
            const reader = __metrics['reader'] as any;
            jest.spyOn(reader, 'forceFlush').mockRejectedValue(metricsError);
        }
        if (__tracing && __tracing['processor']) {
            const processor = __tracing['processor'] as any;
            jest.spyOn(processor, 'forceFlush').mockRejectedValue(tracesError);
        }

        // flushAllSignals should complete without throwing
        await expect(flushAllSignals()).resolves.not.toThrow();

        // Verify that both errors were logged
        expect(consoleWarnSpy).toHaveBeenCalled();
        const warnCalls = consoleWarnSpy.mock.calls.flat().join(' ');
        expect(warnCalls).toContain('Metric export failed');
        expect(warnCalls).toContain('Metrics 404');
        expect(warnCalls).toContain('Trace export failed');
        expect(warnCalls).toContain('Traces 404');
    });

    test('flushAllSignals should handle non-Error exceptions', async () => {
        // Initialize with console output
        const config = new Configuration().setUseConsoleOutput(true);
        const attributes = new ResourceAttributes("test_service", "0.0.1");

        initializeTelemetry(config, attributes, ["metrics", "tracing"]);

        expect(__initialized).toBe(true);
        expect(__tracing).toBeDefined();

        // Create a span
        const span = getTrace("test-span");
        span?.end();

        // Mock processor's forceFlush to throw a string (not an Error object)
        if (__tracing && __tracing['processor']) {
            const processor = __tracing['processor'] as any;
            jest.spyOn(processor, 'forceFlush').mockRejectedValue('String error message');
        }

        // flushAllSignals should complete without throwing
        await expect(flushAllSignals()).resolves.not.toThrow();

        // Verify that the error was logged
        expect(consoleWarnSpy).toHaveBeenCalled();
        const warnCalls = consoleWarnSpy.mock.calls.flat().join(' ');
        expect(warnCalls).toContain('Trace export failed');
        expect(warnCalls).toContain('String error message');
    });

    test('flush should succeed when no errors occur', async () => {
        // Initialize with console output
        const config = new Configuration().setUseConsoleOutput(true);
        const attributes = new ResourceAttributes("test_service", "0.0.1");

        initializeTelemetry(config, attributes, ["metrics", "tracing"]);

        expect(__initialized).toBe(true);
        expect(__metrics).toBeDefined();
        expect(__tracing).toBeDefined();

        // Create telemetry data
        incrementCounter({ name: "test-counter" });
        const span = getTrace("test-span");
        span?.end();

        // flushAllSignals should complete successfully
        await expect(flushAllSignals()).resolves.not.toThrow();

        // No warnings should be logged
        const warnCalls = consoleWarnSpy.mock.calls.flat().join(' ');
        expect(warnCalls).not.toContain('export failed');
    });
});
