// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs'
import * as path from 'path'

import { jest, expect, beforeEach } from '@jest/globals';

import { Configuration, InternalConfiguration } from '../../src/config'
import { ResourceAttributes, InternalResourceAttributes } from '../../src/attributes'
import { AnacondaMetrics, CounterArgs, HistogramArgs, NoopMetricExporter } from '../../src/metrics'

jest.mock('@opentelemetry/sdk-metrics')
jest.mock('@opentelemetry/exporter-metrics-otlp-grpc')
jest.mock('@opentelemetry/exporter-metrics-otlp-http')
jest.mock('@opentelemetry/api')

import { type Attributes, metrics as otelmetrics } from '@opentelemetry/api'
import { type Meter } from '@opentelemetry/api'
import { type Resource } from "@opentelemetry/resources"

const mockedMetrics = otelmetrics as jest.Mocked<typeof otelmetrics>
const mockedMeter: jest.Mocked<Meter> = {
  createUpDownCounter: jest.fn().mockReturnValue({ add: jest.fn() }),
  createCounter: jest.fn().mockReturnValue({ add: jest.fn() }),
  createHistogram: jest.fn().mockReturnValue({ record: jest.fn() }),

  // Required to satisfy full Meter interface — stub as needed
  createObservableGauge: jest.fn(),
  createObservableCounter: jest.fn(),
  createObservableUpDownCounter: jest.fn(),
  createGauge: jest.fn(),
  removeBatchObservableCallback: jest.fn(),
  addBatchObservableCallback: jest.fn(),
}

var certFile: string
var metrics: AnacondaMetrics
var counter: number = 0
beforeEach(() => {
    certFile = path.join(process.cwd(), "testFile.cert")
    fs.writeFileSync(certFile, "Example Cert File")
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const config = new Configuration().setUseConsoleOutput(true).setUseCumulativeMetrics((counter % 2) === 1)
    const attributes = new ResourceAttributes("test_service", "0.0.1")
    metrics = new AnacondaMetrics(config, attributes)
    metrics.meter = mockedMeter
    // mockedMetrics.setGlobalMeterProvider.mockReturnValue(true)
    counter++
    process.env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE = undefined
})

afterEach(() => {
    if (fs.existsSync(certFile)) {
        fs.unlinkSync(certFile)
    }
    jest.restoreAllMocks()
})

test("verify AnacondaMetrics class instantiation", () => {
    // Verify the instance is created correctly
    expect(metrics).toBeInstanceOf(AnacondaMetrics)
    expect(metrics.config).toBeInstanceOf(InternalConfiguration)
    expect(metrics.attributes).toBeInstanceOf(InternalResourceAttributes)
    expect(Object.keys(metrics.mapOfCounters).length).toBe(0)
 })

 test("verify recordHistogram", () => {
    expect(metrics.recordHistogram({name: "name1", value: 42, attributes: {"reason": "test"}})).toBe(true)
    expect(Object.keys(metrics.mapOfHistograms).length).toBe(1)
    expect(metrics.recordHistogram({name: "name2", value: 99, attributes: {"reason": "test"}})).toBe(true)
    expect(metrics.recordHistogram({name: "name2", value: 109, attributes: {"reason": "test"}})).toBe(true)
    expect(Object.keys(metrics.mapOfHistograms).length).toBe(2)
    metrics.meter = null
    expect(metrics.recordHistogram({name: "name3", value: 0, attributes: {"reason": "test"}})).toBe(false)
})

test("verify incrementCounter and decrementCounter", () => {
    expect(metrics.incrementCounter({name: "name1", forceUpDownCounter: false, by: 2, attributes: {"reason": "test"}})).toBe(true)
    expect(Object.keys(metrics.mapOfCounters).length).toBe(1)
    expect(metrics.incrementCounter({name: "name1", forceUpDownCounter: false, by: 2, attributes: {"reason": "test"}})).toBe(true)
    expect(metrics.incrementCounter({name: "name2", forceUpDownCounter: true,  by: 2, attributes: {"reason": "test"}})).toBe(true)
    expect(Object.keys(metrics.mapOfCounters).length).toBe(2)
    expect(metrics.decrementCounter({name: "name1", by: 1, attributes: {"reason": "test"}})).toBe(false)
    expect(metrics.decrementCounter({name: "name2", by: 1})).toBe(true)
    expect(metrics.incrementCounter({name: "name2", forceUpDownCounter: false, by: 2, attributes: {"reason": "test"}})).toBe(true)
    expect(Object.keys(metrics.mapOfCounters).length).toBe(2)
    metrics.meter = null
    expect(metrics.incrementCounter({name: "name2", forceUpDownCounter: true, by: 2, attributes: {"reason": "test"}})).toBe(false)
})

test("verify non-console implementation for setup and variations", () => {
    var counter = 0
    for (let authToken of [undefined, "auth_token"]) {
        for (let cert of [undefined, certFile]) {
            const ports: Record<string,number> = { "http": 80, "https": 443, "grpc": 4317, "grpcs": 4318, "devnull": 0, "unknown": 0 }
            for (let schema of Object.keys(ports)) {
                counter += 1
                if (counter === 19) { // Last time through nested loops ((2 * 2 * 5) - 1).
                    fs.unlinkSync(certFile)
                    // mockedMetrics.setGlobalMeterProvider.mockReturnValue(false)
                    process.env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE = "DELTA"
                }
                const port = ports[schema]
                const str = `${schema}://localhost:${port}/v1/metrics`
                const url = new URL(str)
                const config = new Configuration();
                config.setMetricsEndpoint(url, authToken, cert)
                const attributes = new ResourceAttributes("test_service", "0.0.1")
                metrics = new AnacondaMetrics(config, attributes)
                metrics.meter = mockedMeter
            }
        }
    }
})

function createMockAttributes() : jest.Mocked<Attributes> {
    return {}
}

function createMockResource(): jest.Mocked<Resource> {
  return {
    asyncAttributesPending: undefined,
    attributes: createMockAttributes(),
    waitForAsyncAttributes: jest.fn(),
    merge: jest.fn(),
    getRawAttributes: jest.fn()
  };
}

test("test no-op metrics exporter", () => {
    const exporter = new NoopMetricExporter()
    exporter.export({ resource: createMockResource(), scopeMetrics: [] }, (result: any) => {})
    exporter.forceFlush()
    exporter.shutdown()
})

test("check for invalid names", () => {
    expect(metrics.decrementCounter({name: "#name", by: 1})).toBe(false)
    expect(metrics.incrementCounter({name: "name#", forceUpDownCounter: false, by: 1})).toBe(false)
    expect(metrics.recordHistogram({name: "#name#", value: 42})).toBe(false)
})

test("dummy tests for argument objects (would lower coverage but could be deleteed)", () => {
    const counter = new CounterArgs()
    const histogram = new HistogramArgs()
})
