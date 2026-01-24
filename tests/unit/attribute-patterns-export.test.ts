// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

/**
 * Attribute Patterns Export Validation Test Suite
 *
 * This test suite validates that all 4 attribute patterns produce the correct
 * data structure when passed to the exporter (simulating backend persistence call).
 *
 * These tests mock the exporter layer and verify what attributes would be sent
 * to the backend for each pattern. This provides:
 * - Fast feedback (no real network calls)
 * - Easy debugging (simple mocks)
 * - Persistence validation (what backend would receive)
 *
 * The 4 patterns tested:
 * 1. NO user_id + NO attributes → {"user.id": ""} → May be rejected
 * 2. NO user_id + YES attributes → {"user.id": "", ...attrs} → Works ✅
 * 3. YES user_id + NO attributes → {"user.id": "value"} → May be rejected
 * 4. YES user_id + YES attributes → {"user.id": "value", ...attrs} → Works ✅
 *
 * See: _docs/ANALYSIS-init8-debug-logging-findings.md
 */

import { jest, expect, beforeEach, afterEach, test } from '@jest/globals';
import { Configuration } from '../../src/config';
import { ResourceAttributes, InternalResourceAttributes } from '../../src/attributes';
import { AnacondaMetrics } from '../../src/metrics';

// Mock OpenTelemetry SDK components
jest.mock('@opentelemetry/sdk-metrics');
jest.mock('@opentelemetry/exporter-metrics-otlp-grpc');
jest.mock('@opentelemetry/exporter-metrics-otlp-http');
jest.mock('@opentelemetry/api');

import { type Meter, type Counter, type Histogram, type UpDownCounter } from '@opentelemetry/api';

// Create mocked instruments that capture attributes
const makeCounter = () => {
    const counter = {
        add: jest.fn((value: number, attributes: any) => {
            // Store for export validation
            captureForExport('counter', attributes, value);
        })
    };
    return counter as unknown as jest.Mocked<Counter>;
};

const makeHistogram = () => {
    const histogram = {
        record: jest.fn((value: number, attributes: any) => {
            // Store for export validation
            captureForExport('histogram', attributes, value);
        })
    };
    return histogram as unknown as jest.Mocked<Histogram>;
};

const makeUpDownCounter = () => {
    const counter = {
        add: jest.fn((value: number, attributes: any) => {
            // Store for export validation
            captureForExport('updown', attributes, value);
        })
    };
    return counter as unknown as jest.Mocked<UpDownCounter>;
};

// Capture data that would be exported
interface CapturedMetric {
    type: string;
    attributes: any;
    value: number;
}

let capturedMetrics: CapturedMetric[] = [];

function captureForExport(type: string, attributes: any, value: number) {
    capturedMetrics.push({ type, attributes, value });
}

// Create mocked Meter
const mockedMeter: jest.Mocked<Meter> = (() => {
    const m: any = {};
    m.createCounter = jest.fn(() => makeCounter());
    m.createUpDownCounter = jest.fn(() => makeUpDownCounter());
    m.createHistogram = jest.fn(() => makeHistogram());
    m.createObservableGauge = jest.fn();
    m.createObservableCounter = jest.fn();
    m.createObservableUpDownCounter = jest.fn();
    m.addBatchObservableCallback = jest.fn();
    m.removeBatchObservableCallback = jest.fn();
    return m as jest.Mocked<Meter>;
})();

beforeEach(() => {
    // Suppress console output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset captured data
    capturedMetrics = [];
    jest.clearAllMocks();

    // Clear ResourceAttributes internal state
    for (const key in InternalResourceAttributes.__lookupImpl) {
        delete InternalResourceAttributes.__lookupImpl[key];
    }
    InternalResourceAttributes.__nextId = 0;
});

afterEach(() => {
    jest.restoreAllMocks();
});

/**
 * Helper to create metrics instance with mocked meter
 */
function createMetrics(userId?: string): AnacondaMetrics {
    const config = new Configuration().setUseConsoleOutput(true);
    const attributes = userId
        ? new ResourceAttributes("test-service", "1.0.0", "", "", "", "", "", "", userId)
        : new ResourceAttributes("test-service", "1.0.0");

    const metrics = new AnacondaMetrics(config, attributes);
    metrics.meter = mockedMeter;
    return metrics;
}

/**
 * Pattern #1: NO user_id + NO attributes
 * Result: {"user.id": ""} - Only user.id, may be rejected by backend
 */
test("Pattern #1: NO user_id + NO attributes → only user.id exported", () => {
    const metrics = createMetrics(); // No user_id

    // Record metric with empty attributes
    metrics.incrementCounter({
        name: "test_counter",
        by: 1,
        attributes: {} // Empty
    });

    // Verify what would be sent to exporter
    expect(capturedMetrics.length).toBe(1);
    expect(capturedMetrics[0].attributes).toEqual({
        "user.id": ""
    });

    // KEY FINDING: Only user.id attribute
    // Backend may silently reject this pattern
    expect(Object.keys(capturedMetrics[0].attributes).length).toBe(1);
});

/**
 * Pattern #2: NO user_id + YES attributes
 * Result: {"user.id": "", ...custom} - Works ✅
 */
test("Pattern #2: NO user_id + YES attributes → user.id + custom attrs exported ✅", () => {
    const metrics = createMetrics(); // No user_id

    // Record metric with custom attributes
    metrics.incrementCounter({
        name: "test_counter",
        by: 1,
        attributes: {
            example: "01",
            test_type: "all_signals"
        }
    });

    // Verify what would be sent to exporter
    expect(capturedMetrics.length).toBe(1);
    expect(capturedMetrics[0].attributes).toEqual({
        "user.id": "",
        "example": "01",
        "test_type": "all_signals"
    });

    // KEY FINDING: Has user.id + custom attributes (3 total)
    // Backend accepts this pattern ✅
    expect(Object.keys(capturedMetrics[0].attributes).length).toBe(3);
});

/**
 * Pattern #3: YES user_id + NO attributes
 * Result: {"user.id": "value"} - Only user.id, may be rejected by backend
 */
test("Pattern #3: YES user_id + NO attributes → only user.id exported", () => {
    const metrics = createMetrics("test-user-123"); // WITH user_id

    // Record metric with empty attributes
    metrics.incrementCounter({
        name: "test_counter",
        by: 1,
        attributes: {} // Empty
    });

    // Verify what would be sent to exporter
    expect(capturedMetrics.length).toBe(1);
    expect(capturedMetrics[0].attributes).toEqual({
        "user.id": "test-user-123"
    });

    // KEY FINDING: Only user.id attribute (even though it has a value)
    // Backend may still silently reject this pattern
    expect(Object.keys(capturedMetrics[0].attributes).length).toBe(1);
});

/**
 * Pattern #4: YES user_id + YES attributes ⭐ RECOMMENDED
 * Result: {"user.id": "value", ...custom} - Works ✅
 */
test("Pattern #4: YES user_id + YES attributes → user.id + custom attrs exported ✅", () => {
    const metrics = createMetrics("prod-user-456"); // WITH user_id

    // Record metric with custom attributes
    metrics.incrementCounter({
        name: "test_counter",
        by: 1,
        attributes: {
            example: "02",
            test_type: "metrics_only"
        }
    });

    // Verify what would be sent to exporter
    expect(capturedMetrics.length).toBe(1);
    expect(capturedMetrics[0].attributes).toEqual({
        "user.id": "prod-user-456",
        "example": "02",
        "test_type": "metrics_only"
    });

    // KEY FINDING: Has user.id + custom attributes (3 total)
    // Backend accepts this pattern ✅
    // This is the RECOMMENDED pattern for production
    expect(Object.keys(capturedMetrics[0].attributes).length).toBe(3);
});
