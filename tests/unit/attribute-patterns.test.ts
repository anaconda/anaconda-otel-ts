// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

/**
 * Attribute Patterns Test Suite
 *
 * This test suite validates the 4 attribute patterns discovered during
 * the empty attributes bug investigation (2026-01-23).
 *
 * Context:
 * When users pass empty {} attributes to metric functions, the SDK correctly
 * converts them to {"user.id": ""} or {"user.id": "actual-id"} by retrieving
 * resource attributes and merging with user-provided attributes.
 *
 * The 4 patterns represent all combinations of:
 * - user_id: present or absent
 * - attributes: empty {} or with values
 *
 * These tests document expected SDK behavior and serve as regression protection.
 *
 * See: _docs/ANALYSIS-init8-debug-logging-findings.md
 */

import { jest, expect, beforeEach, afterEach } from '@jest/globals';
import { Configuration } from '../../src/config';
import { ResourceAttributes } from '../../src/attributes';
import { AnacondaMetrics, CounterArgs, HistogramArgs } from '../../src/metrics';

// Mock OpenTelemetry dependencies
jest.mock('@opentelemetry/sdk-metrics');
jest.mock('@opentelemetry/exporter-metrics-otlp-grpc');
jest.mock('@opentelemetry/exporter-metrics-otlp-http');
jest.mock('@opentelemetry/api');

import { type Meter, type Counter, type Histogram, type UpDownCounter } from '@opentelemetry/api';

// Helper to create mocked instruments
const makeCounter = () => ({ add: jest.fn() }) as unknown as jest.Mocked<Counter>;
const makeHistogram = () => ({ record: jest.fn() }) as unknown as jest.Mocked<Histogram>;
const makeUpDownCounter = () => ({ add: jest.fn() }) as unknown as jest.Mocked<UpDownCounter>;

// Create a mocked Meter
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

let metrics: AnacondaMetrics;

beforeEach(() => {
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset mock calls
    jest.clearAllMocks();
});

afterEach(() => {
    jest.restoreAllMocks();
});

/**
 * Helper function to create AnacondaMetrics instance with mocked meter
 */
function createMetricsInstance(userId?: string): AnacondaMetrics {
    const config = new Configuration().setUseConsoleOutput(true);
    const attributes = userId
        ? new ResourceAttributes("test-service", "1.0.0", "", "", "", "", "", "", userId)
        : new ResourceAttributes("test-service", "1.0.0");

    const metricsInstance = new AnacondaMetrics(config, attributes);
    metricsInstance.meter = mockedMeter;
    return metricsInstance;
}

/**
 * Helper to get the attributes passed to a mocked counter.add() call
 */
function getCounterAttributes(counter: jest.Mocked<Counter>, callIndex: number = 0): any {
    return (counter.add as jest.Mock).mock.calls[callIndex][1];
}

/**
 * Helper to get the attributes passed to a mocked histogram.record() call
 */
function getHistogramAttributes(histogram: jest.Mocked<Histogram>, callIndex: number = 0): any {
    return (histogram.record as jest.Mock).mock.calls[callIndex][1];
}

describe("Attribute Pattern #1: NO user_id + NO attributes", () => {
    /**
     * Pattern #1: NO user_id + NO attributes
     *
     * User setup:
     * - ResourceAttributes created WITHOUT user_id (9th parameter not provided)
     * - Metric recorded with empty {} attributes
     *
     * Expected behavior:
     * - User passes: {}
     * - SDK retrieves resource attributes: {"user.id": ""}
     * - SDK adds no user attributes (empty object provided)
     * - Final attributes: {"user.id": ""}
     *
     * Note: This pattern may be rejected by backend if it requires
     * at least one attribute besides user.id
     */

    beforeEach(() => {
        metrics = createMetricsInstance(); // No user_id
    });

    test("incrementCounter with empty {} attributes produces {'user.id': ''}", () => {
        const result = metrics.incrementCounter({
            name: "test_counter",
            by: 1,
            attributes: {}
        });

        expect(result).toBe(true);

        // Get the counter that was created
        const [counter] = metrics.mapOfCounters["test_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // Verify final attributes
        expect(attrs).toEqual({ "user.id": "" });
        expect(Object.keys(attrs).length).toBe(1);
    });

    test("recordHistogram with empty {} attributes produces {'user.id': ''}", () => {
        const result = metrics.recordHistogram({
            name: "test_histogram",
            value: 42.5,
            attributes: {}
        });

        expect(result).toBe(true);

        // Get the histogram that was created
        const histogram = metrics.mapOfHistograms["test_histogram"];
        const attrs = getHistogramAttributes(histogram as jest.Mocked<Histogram>);

        // Verify final attributes
        expect(attrs).toEqual({ "user.id": "" });
        expect(Object.keys(attrs).length).toBe(1);
    });

    test("incrementCounter with undefined attributes produces {'user.id': ''}", () => {
        const result = metrics.incrementCounter({
            name: "test_counter_no_attrs",
            by: 1
            // attributes parameter omitted
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter_no_attrs"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // Verify final attributes
        expect(attrs).toEqual({ "user.id": "" });
        expect(Object.keys(attrs).length).toBe(1);
    });

    test("decrementCounter with empty {} attributes produces {'user.id': ''}", () => {
        const result = metrics.decrementCounter({
            name: "test_updown",
            by: 1,
            attributes: {}
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_updown"];
        const attrs = getCounterAttributes(counter as jest.Mocked<UpDownCounter>);

        // Verify final attributes
        expect(attrs).toEqual({ "user.id": "" });
        expect(Object.keys(attrs).length).toBe(1);
    });
});

describe("Attribute Pattern #2: NO user_id + YES attributes", () => {
    /**
     * Pattern #2: NO user_id + YES attributes
     *
     * User setup:
     * - ResourceAttributes created WITHOUT user_id
     * - Metric recorded with custom attributes
     *
     * Expected behavior:
     * - User passes: {"example": "01", "test_type": "all_signals"}
     * - SDK retrieves resource attributes: {"user.id": ""}
     * - SDK adds user attributes: {"example": "01", "test_type": "all_signals"}
     * - Final attributes: {"user.id": "", "example": "01", "test_type": "all_signals"}
     *
     * Backend status: ✅ WORKS - Backend accepts and persists
     */

    beforeEach(() => {
        metrics = createMetricsInstance(); // No user_id
    });

    test("incrementCounter with custom attributes includes user.id and custom attrs", () => {
        const result = metrics.incrementCounter({
            name: "test_counter",
            by: 1,
            attributes: {
                example: "01",
                test_type: "all_signals",
                environment: "staging"
            }
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // Verify final attributes include user.id + custom attributes
        expect(attrs).toEqual({
            "user.id": "",
            "example": "01",
            "test_type": "all_signals",
            "environment": "staging"
        });
        expect(Object.keys(attrs).length).toBe(4);
    });

    test("recordHistogram with custom attributes includes user.id and custom attrs", () => {
        const result = metrics.recordHistogram({
            name: "test_histogram",
            value: 55.2,
            attributes: {
                region: "us-west-2",
                status: "success"
            }
        });

        expect(result).toBe(true);

        const histogram = metrics.mapOfHistograms["test_histogram"];
        const attrs = getHistogramAttributes(histogram as jest.Mocked<Histogram>);

        // Verify final attributes
        expect(attrs).toEqual({
            "user.id": "",
            "region": "us-west-2",
            "status": "success"
        });
        expect(Object.keys(attrs).length).toBe(3);
    });

    test("multiple metrics with different attributes each have user.id", () => {
        // Counter 1
        metrics.incrementCounter({
            name: "counter1",
            by: 1,
            attributes: { metric: "counter1" }
        });

        // Counter 2
        metrics.incrementCounter({
            name: "counter2",
            by: 1,
            attributes: { metric: "counter2" }
        });

        // Verify counter1 attributes
        const [counter1] = metrics.mapOfCounters["counter1"];
        const attrs1 = getCounterAttributes(counter1 as jest.Mocked<Counter>);
        expect(attrs1).toEqual({ "user.id": "", "metric": "counter1" });

        // Verify counter2 attributes
        const [counter2] = metrics.mapOfCounters["counter2"];
        const attrs2 = getCounterAttributes(counter2 as jest.Mocked<Counter>);
        expect(attrs2).toEqual({ "user.id": "", "metric": "counter2" });
    });
});

describe("Attribute Pattern #3: YES user_id + NO attributes", () => {
    /**
     * Pattern #3: YES user_id + NO attributes
     *
     * User setup:
     * - ResourceAttributes created WITH user_id
     * - Metric recorded with empty {} attributes
     *
     * Expected behavior:
     * - User passes: {}
     * - SDK retrieves resource attributes: {"user.id": "actual-user-id"}
     * - SDK adds no user attributes (empty object provided)
     * - Final attributes: {"user.id": "actual-user-id"}
     *
     * Note: This pattern may be rejected by backend if it requires
     * at least one attribute besides user.id
     */

    beforeEach(() => {
        metrics = createMetricsInstance("test-user-123"); // WITH user_id
    });

    test("incrementCounter with empty {} attributes produces {'user.id': 'test-user-123'}", () => {
        const result = metrics.incrementCounter({
            name: "test_counter",
            by: 1,
            attributes: {}
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // Verify final attributes include ONLY user.id with actual value
        expect(attrs).toEqual({ "user.id": "test-user-123" });
        expect(Object.keys(attrs).length).toBe(1);
    });

    test("recordHistogram with empty {} attributes produces {'user.id': 'test-user-123'}", () => {
        const result = metrics.recordHistogram({
            name: "test_histogram",
            value: 42.5,
            attributes: {}
        });

        expect(result).toBe(true);

        const histogram = metrics.mapOfHistograms["test_histogram"];
        const attrs = getHistogramAttributes(histogram as jest.Mocked<Histogram>);

        // Verify final attributes
        expect(attrs).toEqual({ "user.id": "test-user-123" });
        expect(Object.keys(attrs).length).toBe(1);
    });

    test("incrementCounter with undefined attributes produces {'user.id': 'test-user-123'}", () => {
        const result = metrics.incrementCounter({
            name: "test_counter_no_attrs",
            by: 1
            // attributes parameter omitted
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter_no_attrs"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // Verify final attributes
        expect(attrs).toEqual({ "user.id": "test-user-123" });
        expect(Object.keys(attrs).length).toBe(1);
    });
});

describe("Attribute Pattern #4: YES user_id + YES attributes", () => {
    /**
     * Pattern #4: YES user_id + YES attributes
     *
     * User setup:
     * - ResourceAttributes created WITH user_id
     * - Metric recorded with custom attributes
     *
     * Expected behavior:
     * - User passes: {"example": "02", "test_type": "metrics_only"}
     * - SDK retrieves resource attributes: {"user.id": "actual-user-id"}
     * - SDK adds user attributes: {"example": "02", "test_type": "metrics_only"}
     * - Final attributes: {"user.id": "actual-user-id", "example": "02", "test_type": "metrics_only"}
     *
     * Backend status: ✅ WORKS - Backend accepts and persists
     * Recommended pattern: Most reliable, always works
     */

    beforeEach(() => {
        metrics = createMetricsInstance("test-user-456"); // WITH user_id
    });

    test("incrementCounter with custom attributes includes user.id and custom attrs", () => {
        const result = metrics.incrementCounter({
            name: "test_counter",
            by: 1,
            attributes: {
                example: "02",
                test_type: "metrics_only",
                source: "unit-test"
            }
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // Verify final attributes include user.id + custom attributes
        expect(attrs).toEqual({
            "user.id": "test-user-456",
            "example": "02",
            "test_type": "metrics_only",
            "source": "unit-test"
        });
        expect(Object.keys(attrs).length).toBe(4);
    });

    test("recordHistogram with custom attributes includes user.id and custom attrs", () => {
        const result = metrics.recordHistogram({
            name: "test_histogram",
            value: 99.9,
            attributes: {
                endpoint: "/api/users",
                status: "200"
            }
        });

        expect(result).toBe(true);

        const histogram = metrics.mapOfHistograms["test_histogram"];
        const attrs = getHistogramAttributes(histogram as jest.Mocked<Histogram>);

        // Verify final attributes
        expect(attrs).toEqual({
            "user.id": "test-user-456",
            "endpoint": "/api/users",
            "status": "200"
        });
        expect(Object.keys(attrs).length).toBe(3);
    });

    test("decrementCounter with custom attributes includes user.id and custom attrs", () => {
        const result = metrics.decrementCounter({
            name: "test_updown",
            by: 5,
            attributes: {
                action: "decrement",
                reason: "cleanup"
            }
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_updown"];
        const attrs = getCounterAttributes(counter as jest.Mocked<UpDownCounter>);

        // Verify final attributes
        expect(attrs).toEqual({
            "user.id": "test-user-456",
            "action": "decrement",
            "reason": "cleanup"
        });
        expect(Object.keys(attrs).length).toBe(3);
    });

    test("multiple metrics with different user_ids maintain correct attributes", () => {
        // Create another instance with different user_id
        const metrics2 = createMetricsInstance("different-user-789");

        // Record metrics in both instances
        metrics.incrementCounter({
            name: "counter1",
            by: 1,
            attributes: { source: "instance1" }
        });

        metrics2.incrementCounter({
            name: "counter1",
            by: 1,
            attributes: { source: "instance2" }
        });

        // Verify first instance
        const [counter1] = metrics.mapOfCounters["counter1"];
        const attrs1 = getCounterAttributes(counter1 as jest.Mocked<Counter>);
        expect(attrs1).toEqual({
            "user.id": "test-user-456",
            "source": "instance1"
        });

        // Verify second instance
        const [counter2] = metrics2.mapOfCounters["counter1"];
        const attrs2 = getCounterAttributes(counter2 as jest.Mocked<Counter>);
        expect(attrs2).toEqual({
            "user.id": "different-user-789",
            "source": "instance2"
        });
    });
});

describe("Edge Cases and Attribute Merging", () => {
    /**
     * Additional tests for attribute merging behavior
     */

    test("attributes with null/undefined values are filtered out", () => {
        metrics = createMetricsInstance();

        const result = metrics.incrementCounter({
            name: "test_counter",
            by: 1,
            attributes: {
                valid: "value",
                null_value: null as any,
                undefined_value: undefined as any,
                empty_string: ""
            }
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // null and undefined should be filtered, empty string should remain
        expect(attrs).toEqual({
            "user.id": "",
            "valid": "value"
            // null_value and undefined_value should not be present
            // empty_string is also filtered by makeEventAttributes if statement
        });
    });

    test("attribute keys can contain underscores and dots", () => {
        metrics = createMetricsInstance("user-123");

        const result = metrics.incrementCounter({
            name: "test_counter",
            by: 1,
            attributes: {
                "http.status": "200",
                "request_id": "req-123",
                "trace.span.id": "span-456"
            }
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        expect(attrs).toEqual({
            "user.id": "user-123",
            "http.status": "200",
            "request_id": "req-123",
            "trace.span.id": "span-456"
        });
    });

    test("numeric and boolean attribute values are preserved", () => {
        metrics = createMetricsInstance();

        const result = metrics.incrementCounter({
            name: "test_counter",
            by: 1,
            attributes: {
                count: 42,
                enabled: true,
                ratio: 0.95
            }
        });

        expect(result).toBe(true);

        const [counter] = metrics.mapOfCounters["test_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        expect(attrs).toEqual({
            "user.id": "",
            "count": 42,
            "enabled": true,
            "ratio": 0.95
        });
    });
});

describe("Documentation: Backend Compatibility", () => {
    /**
     * These tests document which patterns work with the backend.
     *
     * As of 2026-01-23, the backend has a silent validation issue where
     * metrics with ONLY user.id attribute (Patterns #1 and #3) are accepted
     * but not persisted to the database.
     *
     * Workaround: Always include at least one custom attribute besides user.id
     * (use Patterns #2 or #4).
     *
     * See: _docs/ANALYSIS-init8-debug-logging-findings.md
     */

    test("DOCUMENTATION: Pattern #1 (NO user + NO attrs) - May be rejected by backend", () => {
        // This pattern produces: {"user.id": ""}
        // Backend may silently drop metrics with only user.id attribute

        metrics = createMetricsInstance(); // No user_id

        metrics.incrementCounter({
            name: "pattern1_counter",
            by: 1,
            attributes: {}
        });

        const [counter] = metrics.mapOfCounters["pattern1_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // SDK correctly processes this
        expect(attrs).toEqual({ "user.id": "" });

        // But backend may silently drop it (as of 2026-01-23)
        // Workaround: Always add at least one custom attribute
    });

    test("DOCUMENTATION: Pattern #2 (NO user + YES attrs) - Works with backend ✅", () => {
        // This pattern produces: {"user.id": "", "custom": "value", ...}
        // Backend accepts and persists these metrics

        metrics = createMetricsInstance(); // No user_id

        metrics.incrementCounter({
            name: "pattern2_counter",
            by: 1,
            attributes: { source: "app", version: "1.0" }
        });

        const [counter] = metrics.mapOfCounters["pattern2_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        expect(attrs).toEqual({
            "user.id": "",
            "source": "app",
            "version": "1.0"
        });

        // Backend accepts this ✅
    });

    test("DOCUMENTATION: Pattern #3 (YES user + NO attrs) - May be rejected by backend", () => {
        // This pattern produces: {"user.id": "actual-id"}
        // Backend may silently drop metrics with only user.id attribute

        metrics = createMetricsInstance("user-123"); // WITH user_id

        metrics.incrementCounter({
            name: "pattern3_counter",
            by: 1,
            attributes: {}
        });

        const [counter] = metrics.mapOfCounters["pattern3_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        // SDK correctly processes this
        expect(attrs).toEqual({ "user.id": "user-123" });

        // But backend may silently drop it (as of 2026-01-23)
        // Workaround: Always add at least one custom attribute
    });

    test("DOCUMENTATION: Pattern #4 (YES user + YES attrs) - Works with backend ✅ RECOMMENDED", () => {
        // This pattern produces: {"user.id": "actual-id", "custom": "value", ...}
        // Backend accepts and persists these metrics
        // This is the MOST RELIABLE pattern

        metrics = createMetricsInstance("user-456"); // WITH user_id

        metrics.incrementCounter({
            name: "pattern4_counter",
            by: 1,
            attributes: { source: "app", version: "1.0" }
        });

        const [counter] = metrics.mapOfCounters["pattern4_counter"];
        const attrs = getCounterAttributes(counter as jest.Mocked<Counter>);

        expect(attrs).toEqual({
            "user.id": "user-456",
            "source": "app",
            "version": "1.0"
        });

        // Backend accepts this ✅
        // This is the RECOMMENDED pattern for production use
    });
});
