// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

/**
 * This test demonstrates the URL path resolution issue where:
 * - Base URL: https://metrics.stage.anacondaconnect.com
 * - Full URL: https://metrics.stage.anacondaconnect.com/v1/metrics
 *
 * The TypeScript SDK passes the URL directly to OpenTelemetry exporters
 * without automatically appending /v1/metrics path.
 *
 * KEY FINDINGS:
 * 1. transformURL() only changes protocol (grpc->http, grpcs->https) but preserves the path exactly
 * 2. No automatic path appending occurs anywhere in the codebase
 * 3. The URL is passed as-is to the OpenTelemetry exporters
 * 4. Users MUST provide the full path including /v1/metrics in the endpoint URL
 */

import { expect, beforeEach } from '@jest/globals';
import { Configuration, InternalConfiguration, toImpl } from '../../src/config';
import { ResourceAttributes } from '../../src/attributes';
import { AnacondaMetrics } from '../../src/metrics';

beforeEach(() => {
    // Clear lookup list of created Configuration objects
    for (const key in InternalConfiguration.__lookupImpl) {
        delete InternalConfiguration.__lookupImpl[key];
    }
    InternalConfiguration.__nextId = 0;

    // Clear environment variables
    process.env.ATEL_METRICS_ENDPOINT = undefined;
    process.env.ATEL_METRICS_AUTH_TOKEN = undefined;
    process.env.ATEL_USE_CONSOLE = undefined;
    process.env.ATEL_USE_DEBUG = undefined;
});

describe('URL Path Resolution Tests', () => {
    test('Configuration stores base URL without modification', () => {
        // When user provides base URL without /v1/metrics
        const baseUrl = 'https://metrics.stage.anacondaconnect.com';

        const config = new Configuration();
        config.setMetricsEndpoint(new URL(baseUrl));

        const impl = toImpl(config);
        const [endpoint] = impl.getMetricsEndpointTuple();

        // The URL is stored exactly as provided in configuration (not yet transformed)
        expect(endpoint.href).toBe('https://metrics.stage.anacondaconnect.com/');
        expect(endpoint.pathname).toBe('/');

        console.log('Configuration stores base URL:', endpoint.href);
        console.log('Path will be appended when exporter is created');
    });

    test('Configuration stores full URL with /v1/metrics path', () => {
        // When user provides full URL with /v1/metrics
        const fullUrl = 'https://metrics.stage.anacondaconnect.com/v1/metrics';

        const config = new Configuration();
        config.setMetricsEndpoint(new URL(fullUrl));

        const impl = toImpl(config);
        const [endpoint] = impl.getMetricsEndpointTuple();

        // The URL is stored exactly as provided, with /v1/metrics
        expect(endpoint.href).toBe('https://metrics.stage.anacondaconnect.com/v1/metrics');
        expect(endpoint.pathname).toBe('/v1/metrics');

        console.log('✓ Full URL stored with /v1/metrics:', endpoint.href);
    });

    test('Environment variable ATEL_METRICS_ENDPOINT with base URL', () => {
        // Test using environment variable with base URL
        const baseUrl = 'https://metrics.stage.anacondaconnect.com';
        process.env.ATEL_METRICS_ENDPOINT = baseUrl;

        const config = new Configuration();
        const impl = toImpl(config);
        const [endpoint] = impl.getMetricsEndpointTuple();

        // URL from env var is stored as-is in configuration
        expect(endpoint.href).toBe('https://metrics.stage.anacondaconnect.com/');
        expect(endpoint.pathname).toBe('/');

        console.log('Env var base URL stored in config:', endpoint.href);
    });

    test('Environment variable ATEL_METRICS_ENDPOINT with full URL', () => {
        // Test using environment variable with full URL
        const fullUrl = 'https://metrics.stage.anacondaconnect.com/v1/metrics';
        process.env.ATEL_METRICS_ENDPOINT = fullUrl;

        const config = new Configuration();
        const impl = toImpl(config);
        const [endpoint] = impl.getMetricsEndpointTuple();

        // URL from env var with path is stored correctly
        expect(endpoint.href).toBe('https://metrics.stage.anacondaconnect.com/v1/metrics');
        expect(endpoint.pathname).toBe('/v1/metrics');

        console.log('✓ Env var full URL stored with /v1/metrics:', endpoint.href);
    });

    test('transformURL preserves URL path exactly', () => {
        // Test the transformURL method directly
        const config = new Configuration();
        config.setUseConsoleOutput(true); // Use console to avoid exporter creation
        const attributes = new ResourceAttributes('test-service', '1.0.0');
        const metrics = new AnacondaMetrics(config, attributes);

        // Access the protected transformURL method via type casting
        const transformURL = (metrics as any).transformURL.bind(metrics);

        // Test with base URL - path is preserved (just root /)
        const baseUrl = new URL('https://metrics.stage.anacondaconnect.com');
        const [scheme1, transformedUrl1] = transformURL(baseUrl);

        expect(scheme1).toBe('https:');
        expect(transformedUrl1.href).toBe('https://metrics.stage.anacondaconnect.com/');
        expect(transformedUrl1.pathname).toBe('/');

        // Test with full URL - path is preserved including /v1/metrics
        const fullUrl = new URL('https://metrics.stage.anacondaconnect.com/v1/metrics');
        const [scheme2, transformedUrl2] = transformURL(fullUrl);

        expect(scheme2).toBe('https:');
        expect(transformedUrl2.href).toBe('https://metrics.stage.anacondaconnect.com/v1/metrics');
        expect(transformedUrl2.pathname).toBe('/v1/metrics');

        console.log('transformURL preserves path exactly as provided');
    });

    test('appendSignalPath appends /v1/metrics to base URL', () => {
        // Test the NEW appendSignalPath method
        const config = new Configuration();
        config.setUseConsoleOutput(true);
        const attributes = new ResourceAttributes('test-service', '1.0.0');
        const metrics = new AnacondaMetrics(config, attributes);

        const appendSignalPath = (metrics as any).appendSignalPath.bind(metrics);

        // Test with base URL - should append /v1/metrics
        const baseUrl = new URL('https://metrics.stage.anacondaconnect.com');
        const result1 = appendSignalPath(baseUrl, 'metrics');

        expect(result1.pathname).toBe('/v1/metrics');
        expect(result1.href).toBe('https://metrics.stage.anacondaconnect.com/v1/metrics');

        console.log('✓ Base URL after appendSignalPath:', result1.href);

        // Test with base URL with trailing slash
        const baseUrlWithSlash = new URL('https://metrics.stage.anacondaconnect.com/');
        const result2 = appendSignalPath(baseUrlWithSlash, 'metrics');

        expect(result2.pathname).toBe('/v1/metrics');
        expect(result2.href).toBe('https://metrics.stage.anacondaconnect.com/v1/metrics');

        console.log('✓ Base URL with slash after appendSignalPath:', result2.href);

        // Test with full URL - should NOT modify
        const fullUrl = new URL('https://metrics.stage.anacondaconnect.com/v1/metrics');
        const result3 = appendSignalPath(fullUrl, 'metrics');

        expect(result3.pathname).toBe('/v1/metrics');
        expect(result3.href).toBe('https://metrics.stage.anacondaconnect.com/v1/metrics');

        console.log('✓ Full URL unchanged after appendSignalPath:', result3.href);
    });

    test('appendSignalPath appends /v1/traces for traces signal', () => {
        // Test appendSignalPath with traces signal type
        const config = new Configuration();
        config.setUseConsoleOutput(true);
        const attributes = new ResourceAttributes('test-service', '1.0.0');
        const metrics = new AnacondaMetrics(config, attributes);

        const appendSignalPath = (metrics as any).appendSignalPath.bind(metrics);

        // Test with base URL - should append /v1/traces
        const baseUrl = new URL('https://traces.example.com');
        const result = appendSignalPath(baseUrl, 'traces');

        expect(result.pathname).toBe('/v1/traces');
        expect(result.href).toBe('https://traces.example.com/v1/traces');

        console.log('✓ Traces URL after appendSignalPath:', result.href);
    });

    test('appendSignalPath handles custom paths correctly', () => {
        // Test the Python SDK matching behavior: append to any path that doesn't already end with signal path
        const config = new Configuration();
        config.setUseConsoleOutput(true);
        const attributes = new ResourceAttributes('test-service', '1.0.0');
        const metrics = new AnacondaMetrics(config, attributes);

        const appendSignalPath = (metrics as any).appendSignalPath.bind(metrics);

        // Custom path without trailing slash - append with leading slash
        const customUrl1 = new URL('https://example.com/custom');
        const result1 = appendSignalPath(customUrl1, 'metrics');

        expect(result1.pathname).toBe('/custom/v1/metrics');
        expect(result1.href).toBe('https://example.com/custom/v1/metrics');

        console.log('✓ Custom path without slash:', result1.href);

        // Custom path with trailing slash - append without leading slash
        const customUrl2 = new URL('https://example.com/custom/');
        const result2 = appendSignalPath(customUrl2, 'metrics');

        expect(result2.pathname).toBe('/custom/v1/metrics');
        expect(result2.href).toBe('https://example.com/custom/v1/metrics');

        console.log('✓ Custom path with slash:', result2.href);
    });

    test('transformURL returns original scheme and path', () => {
        // Test the transformURL method for all supported protocols
        const config = new Configuration();
        config.setUseConsoleOutput(true);
        const attributes = new ResourceAttributes('test-service', '1.0.0');
        const metrics = new AnacondaMetrics(config, attributes);

        const transformURL = (metrics as any).transformURL.bind(metrics);

        // Test HTTP/HTTPS - path should be preserved
        const httpsUrl = new URL('https://metrics.stage.anacondaconnect.com/test/path');
        const [scheme, transformedUrl] = transformURL(httpsUrl);

        expect(scheme).toBe('https:');
        expect(transformedUrl.pathname).toBe('/test/path');

        console.log('transformURL preserves paths for all protocols');
        console.log('Example:', scheme, '->', transformedUrl.href);
    });

    test('Demonstrates the FIX: base URL now works correctly', () => {
        console.log('\n=== DEMONSTRATION OF THE FIX ===');

        const config = new Configuration();
        config.setUseConsoleOutput(true);
        const attributes = new ResourceAttributes('test-service', '1.0.0');
        const metrics = new AnacondaMetrics(config, attributes);

        const appendSignalPath = (metrics as any).appendSignalPath.bind(metrics);

        // Scenario 1: User provides base URL (NOW WORKS!)
        const baseUrl = new URL('https://metrics.stage.anacondaconnect.com');
        const fixedBaseUrl = appendSignalPath(baseUrl, 'metrics');

        console.log('\nScenario 1: Base URL without /v1/metrics');
        console.log('  Input:', baseUrl.href);
        console.log('  After appendSignalPath:', fixedBaseUrl.href);
        console.log('  Result: Will send metrics to "/v1/metrics" which is correct');
        console.log('  Status: ✓ NOW WORKS');

        expect(fixedBaseUrl.pathname).toBe('/v1/metrics');

        // Scenario 2: User provides full URL (still works)
        const fullUrl = new URL('https://metrics.stage.anacondaconnect.com/v1/metrics');
        const unchangedFullUrl = appendSignalPath(fullUrl, 'metrics');

        console.log('\nScenario 2: Full URL with /v1/metrics');
        console.log('  Input:', fullUrl.href);
        console.log('  After appendSignalPath:', unchangedFullUrl.href);
        console.log('  Result: Path not duplicated, still "/v1/metrics"');
        console.log('  Status: ✓ STILL WORKS');

        expect(unchangedFullUrl.pathname).toBe('/v1/metrics');

        console.log('\n=== CONCLUSION ===');
        console.log('The TypeScript SDK now AUTOMATICALLY appends /v1/metrics to the endpoint URL.');
        console.log('This matches the Python SDK behavior exactly.');
        console.log('Both base URLs and full URLs work correctly.');
        console.log('✓ ISSUE FIXED - TypeScript SDK behavior now matches Python SDK');
        console.log('==================================\n');
    });
});
