// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { expect, beforeEach } from '@jest/globals';
import { Configuration, InternalConfiguration, toImpl } from '../../src/config'

beforeEach(() => {
    // Clear lookup list of created Configuration objects.
    for (const key in InternalConfiguration.__lookupImpl) {
        delete InternalConfiguration.__lookupImpl[key]
    }
    // Reset new id counter...
    InternalConfiguration.__nextId = 0

    // Clear environment variables...
    process.env.ATEL_USE_CONSOLE = undefined
    process.env.ATEL_DEFAULT_ENDPOINT = undefined
    process.env.ATEL_DEFAULT_AUTH_TOKEN = undefined
    process.env.ATEL_DEFAULT_TLS_PRIVATE_CA_CERT_FILE = undefined
    process.env.ATEL_METRICS_ENDPOINT = undefined
    process.env.ATEL_METRICS_AUTH_TOKEN = undefined
    process.env.ATEL_METRICS_TLS_PRIVATE_CA_CERT_FILE = undefined
    process.env.ATEL_TRACE_ENDPOINT = undefined
    process.env.ATEL_TRACE_AUTH_TOKEN = undefined
    process.env.ATEL_TRACE_TLS_PRIVATE_CA_CERT_FILE = undefined
    process.env.ATEL_METRICS_EXPORT_INTERVAL_MS = undefined
    process.env.ATEL_SKIP_INTERNET_CHECK = undefined
    process.env.ATEL_TRACING_SESSION_ENTROPY = undefined
    process.env.ATEL_USE_DEBUG = undefined
    process.env.ATEL_USE_CUMULATIVE_METRICS = undefined
})

test("Verify Initial State", () => {
    expect(InternalConfiguration.__nextId).toBe(0)
    expect(InternalConfiguration.__lookupImpl).toBeDefined()
    var length = Object.keys(InternalConfiguration.__lookupImpl).length
    expect(length).toBe(0)
    expect(InternalConfiguration.__nextId).toBe(0)

    var config = new Configuration()
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    expect(impl.useConsole).toBe(false)
    length = Object.keys(InternalConfiguration.__lookupImpl).length
    expect(InternalConfiguration.__nextId).toBe(1)
    expect(length).toBe(1)
    expect(impl.defaultEndpoint[0].toString()).toBe(InternalConfiguration.defaultUrl.toString())
    expect(impl.defaultEndpoint[1]).toBeUndefined()
    expect(impl.defaultEndpoint[2]).toBeUndefined()
})

test("Verify Initial State with env ATEL_USE_CONSOLE set to true", () => {
    expect(InternalConfiguration.__nextId).toBe(0)
    expect(InternalConfiguration.__lookupImpl).toBeDefined()
    var length = Object.keys(InternalConfiguration.__lookupImpl).length
    expect(length).toBe(0)
    expect(InternalConfiguration.__nextId).toBe(0)
    var count = 0
    for (let str of ["true", "yes", "1"]) {
        process.env.ATEL_USE_CONSOLE = str
        var config = new Configuration()
        var impl = toImpl(config)
        expect(impl).toBeDefined()
        expect(impl.useConsole).toBe(false)
        expect(impl.getUseConsole()).toBe(true)
        length = Object.keys(InternalConfiguration.__lookupImpl).length
        expect(InternalConfiguration.__nextId).toBe(count + 1)
        expect(length).toBe(count + 1)
        expect(impl.getDefaultEndpoint().toString()).toBe(InternalConfiguration.consoleUrl.toString())
        expect(impl.defaultEndpoint[1]).toBeUndefined()
        expect(impl.defaultEndpoint[2]).toBeUndefined()
        count++
    }
})

test("Verify use of environment default endpoints", () => {
    process.env.ATEL_DEFAULT_ENDPOINT = "grpc://mydomain.com:1234"
    process.env.ATEL_DEFAULT_AUTH_TOKEN = "My_Hash_Token_String"
    process.env.ATEL_DEFAULT_TLS_PRIVATE_CA_CERT_FILE = "/tmp/mycert.pem"

    var config = new Configuration()
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    expect(impl.defaultEndpoint[0].toString()).toBe("grpc://mydomain.com:1234")
    expect(impl.defaultEndpoint[1]).toBe("My_Hash_Token_String")
    expect(impl.defaultEndpoint[2]).toBe("/tmp/mycert.pem")
})

test("Verify use of invalid environment default endpoint", () => {
    process.env.ATEL_DEFAULT_ENDPOINT = "grpc//nocolon.com:1234"

    expect(() => {
        var config = new Configuration()
    }).toThrow("Invalid URL")
})

test("Verify constructor arguments",() => {
    var config = new Configuration(new URL("grpc://mydomain.com:1234"), "My_Hash_Token_String", "/tmp/mycert.pem")
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    expect(impl.defaultEndpoint[0].toString()).toBe("grpc://mydomain.com:1234")
    expect(impl.defaultEndpoint[1]).toBe("My_Hash_Token_String")
    expect(impl.defaultEndpoint[2]).toBe("/tmp/mycert.pem")
})

test("Verify setUseConsoleOutput value", () => {
    var config = new Configuration().setUseConsoleOutput(true)
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    expect(impl.useConsole).toBe(true)
    var endpoint = impl.getDefaultEndpointTuple()
    expect(endpoint[0].toString()).toBe(InternalConfiguration.consoleUrl.toString())
    expect(endpoint[1]).toBeUndefined()
    expect(endpoint[2]).toBeUndefined()

    config.setUseConsoleOutput(false)
    expect(impl.useConsole).toBe(false)
    endpoint = impl.getDefaultEndpointTuple()
    expect(endpoint[0].toString()).toBe(InternalConfiguration.defaultUrl.toString())
    expect(endpoint[1]).toBeUndefined()
    expect(endpoint[2]).toBeUndefined()
})

test("Verify setting and looping through metrics endpoints", () => {
    var count = 0
    var config = new Configuration()
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe(InternalConfiguration.defaultUrl.toString())
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
        count++
    })
    expect(count).toBe(1)
    // *** For the future addMetricsEndpoint Feature ***
    // config.addMetricsEndpoint(new URL("grpc://metrics.mydomain.com:1234"), "Metrics_Token", "/tmp/metrics.pem")
    // config.addMetricsEndpoint(new URL("grpcs://metrics2.mydomain.com:1234"))
    // count = 0
    // impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
    //     if (count === 0) {
    //         expect(endpoint.toString()).toBe("grpc://metrics.mydomain.com:1234")
    //         expect(authToken).toBe("Metrics_Token")
    //         expect(certFile).toBe("/tmp/metrics.pem")
    //     } else if (count === 1) {
    //         expect(endpoint.toString()).toBe("grpcs://metrics2.mydomain.com:1234")
    //         expect(authToken).toBeUndefined()
    //         expect(certFile).toBeUndefined()
    //     }
    //     count++
    // })
    // expect(count).toBe(2)
    count = 0
    config.setUseConsoleOutput(true)
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe(InternalConfiguration.consoleUrl.toString())
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
        count++
    })
    expect(count).toBe(1)
    count = 0
    config.setUseConsoleOutput(false)
    process.env.ATEL_METRICS_ENDPOINT = "https://metrics.mydomain.com:1234"
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://metrics.mydomain.com:1234/")
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
        count++
    })
    process.env.ATEL_METRICS_AUTH_TOKEN = "Metrics_Token"
    process.env.ATEL_METRICS_TLS_PRIVATE_CA_CERT_FILE = "/tmp/metrics.pem"
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://metrics.mydomain.com:1234/")
        expect(authToken).toBe("Metrics_Token")
        expect(certFile).toBe("/tmp/metrics.pem")
        count++
    })
    expect(count).toBe(2)
    process.env.ATEL_METRICS_ENDPOINT = undefined
    process.env.ATEL_METRICS_AUTH_TOKEN = undefined
    process.env.ATEL_METRICS_TLS_PRIVATE_CA_CERT_FILE = undefined

    count = 0
    config.setMetricsEndpoint(new URL("https://metrics3.mydomain.com:4567"), "Metrics_Token", "/tmp/metrics.pem")
    expect(impl.metricsEndpoints.length).toBe(1)
    expect(impl.getMetricsEndpointTupleList().length).toBe(1)
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://metrics3.mydomain.com:4567/")
        expect(authToken).toBe("Metrics_Token")
        expect(certFile).toBe("/tmp/metrics.pem")
        count++
    })
    expect(count).toBe(1)
})

test("Verify setting and looping through trace endpoints", () => {
    var count = 0
    var config = new Configuration()
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe(InternalConfiguration.defaultUrl.toString())
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
        count++
    })
    expect(count).toBe(1)
    // *** For the future addTraceEndpoint Feature ***
    // config.addTraceEndpoint(new URL("grpc://trace.mydomain.com:1234"), "Trace_Token", "/tmp/trace.pem")
    // config.addTraceEndpoint(new URL("grpcs://trace2.mydomain.com:1234"))
    // count = 0
    // impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
    //     if (count === 0) {
    //         expect(endpoint.toString()).toBe("grpc://trace.mydomain.com:1234")
    //         expect(authToken).toBe("Trace_Token")
    //         expect(certFile).toBe("/tmp/trace.pem")
    //     } else if (count === 1) {
    //         expect(endpoint.toString()).toBe("grpcs://trace2.mydomain.com:1234")
    //         expect(authToken).toBeUndefined()
    //         expect(certFile).toBeUndefined()
    //     }
    //     count++
    // })
    // expect(count).toBe(2)
    count = 0
    config.setUseConsoleOutput(true)
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe(InternalConfiguration.consoleUrl.toString())
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
        count++
    })
    expect(count).toBe(1)
    count = 0
    config.setUseConsoleOutput(false)
    process.env.ATEL_TRACE_ENDPOINT = "https://trace.mydomain.com:1234"
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://trace.mydomain.com:1234/")
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
        count++
    })
    process.env.ATEL_TRACE_AUTH_TOKEN = "Trace_Token"
    process.env.ATEL_TRACE_TLS_PRIVATE_CA_CERT_FILE = "/tmp/trace.pem"
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://trace.mydomain.com:1234/")
        expect(authToken).toBe("Trace_Token")
        expect(certFile).toBe("/tmp/trace.pem")
        count++
    })
    expect(count).toBe(2)
    process.env.ATEL_TRACE_ENDPOINT = undefined
    process.env.ATEL_TRACE_AUTH_TOKEN = undefined
    process.env.ATEL_TRACE_TLS_PRIVATE_CA_CERT_FILE = undefined

    count = 0
    config.setTraceEndpoint(new URL("https://trace3.mydomain.com:4567"), "Trace_Token", "/tmp/trace.pem")
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://trace3.mydomain.com:4567/")
        expect(authToken).toBe("Trace_Token")
        expect(certFile).toBe("/tmp/trace.pem")
        count++
    })
    expect(count).toBe(1)
})

test("Verify the export interval value", () => {
    var configure = new Configuration()
    var impl = toImpl(configure)
    expect(impl).toBeDefined()
    expect(impl.getMetricsExportIntervalMs()).toBe(60000)
    expect(() => {
        configure.setMetricExportIntervalMs(50)
    }).toThrow("*** Metric export interval must be at least 100ms")
    configure.setMetricExportIntervalMs(1000)
    expect(impl.getMetricsExportIntervalMs()).toBe(1000)
    configure.setMetricExportIntervalMs(5000)
    expect(impl.getMetricsExportIntervalMs()).toBe(5000)
    process.env.ATEL_METRICS_EXPORT_INTERVAL_MS = "2000"
    configure = new Configuration()
    impl = toImpl(configure)
    expect(impl).toBeDefined()
    expect(impl.getMetricsExportIntervalMs()).toBe(2000)

    process.env.ATEL_METRICS_EXPORT_INTERVAL_MS = "500"
    configure = new Configuration().setMetricExportIntervalMs(5000)
    impl = toImpl(configure)
    expect(impl).toBeDefined()
    expect(impl.getMetricsExportIntervalMs()).toBe(5000)
})

test("Verify the skip internet check flag", () => {
    var configure = new Configuration()
    var impl = toImpl(configure)
    expect(impl).toBeDefined()
    expect(impl.getSkipInternetCheck()).toBe(false)
    configure.setSkipInternetCheck(true)
    expect(impl.getSkipInternetCheck()).toBe(true)
    configure.setSkipInternetCheck(false)
    expect(impl.getSkipInternetCheck()).toBe(false)
    var values: string[] = ["true", "yes", "1", "false", "no", "0", "different"]
    var results: boolean[] = [true, true, true, false, false, false, false]
    for (let i = 0; i < values.length; i++) {
        process.env.ATEL_SKIP_INTERNET_CHECK = values[i]
        configure = new Configuration()
        impl = toImpl(configure)
        expect(impl).toBeDefined()
        expect(impl.getSkipInternetCheck()).toBe(results[i])
    }
})

test("Verify negative envonment variable for use console output", () => {
    process.env.ATEL_USE_CONSOLE = "false"
    var config = new Configuration(new URL("https://mydomain.com:9876"))
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    expect(impl.useConsole).toBe(false)
    var endpoint = impl.getDefaultEndpointTuple()
    expect(endpoint[0].toString()).toBe("https://mydomain.com:9876/")
    expect(endpoint[1]).toBeUndefined()
    expect(endpoint[2]).toBeUndefined()
    process.env.ATEL_USE_CONSOLE = undefined
    config.setUseConsoleOutput(false)
    expect(impl.useConsole).toBe(false)
    expect(impl.getDefaultEndpoint().toString()).toBe("https://mydomain.com:9876/")
})

test("Verify entropy value", () => {
    var config = new Configuration()
    var impl = toImpl(config)
    expect(impl).toBeDefined()
    expect(impl.entropy).toBe("")
    config.setTracingSessionEntropy("my_entropy_value")
    expect(impl.entropy).toBe("my_entropy_value")
    config.setTracingSessionEntropy("new_entropy_value")
    expect(impl.getEntropy()).toBe("new_entropy_value")
    process.env.ATEL_TRACING_SESSION_ENTROPY = "env_entropy_value"
    expect(impl.getEntropy()).toBe("env_entropy_value")
})

test("Verify set*Endpoint methods", () => {
    var config = new Configuration()
    var impl = toImpl(config)
    expect(impl).toBeDefined()

    // Set metrics endpoint
    config.setMetricsEndpoint(new URL("https://metrics.mydomain.com:1234"), "Metrics_Token", "/tmp/metrics.pem")
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://metrics.mydomain.com:1234/")
        expect(authToken).toBe("Metrics_Token")
        expect(certFile).toBe("/tmp/metrics.pem")
    })
    config.setMetricsEndpoint(new URL("https://metrics.mydomain.com:1234"), "Metrics_Token")
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://metrics.mydomain.com:1234/")
        expect(authToken).toBe("Metrics_Token")
        expect(certFile).toBeUndefined()
    })
    config.setMetricsEndpoint(new URL("https://metrics.mydomain.com:1234"))
    impl.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://metrics.mydomain.com:1234/")
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
    })

    // Set trace endpoint
    config.setTraceEndpoint(new URL("https://trace.mydomain.com:1234"), "Trace_Token", "/tmp/trace.pem")
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://trace.mydomain.com:1234/")
        expect(authToken).toBe("Trace_Token")
        expect(certFile).toBe("/tmp/trace.pem")
    })
    config.setTraceEndpoint(new URL("https://trace.mydomain.com:1234"), "Trace_Token")
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://trace.mydomain.com:1234/")
        expect(authToken).toBe("Trace_Token")
        expect(certFile).toBeUndefined()
    })
    config.setTraceEndpoint(new URL("https://trace.mydomain.com:1234"))
    impl.forEachTraceEndpoints((endpoint, authToken, certFile) => {
        expect(endpoint.toString()).toBe("https://trace.mydomain.com:1234/")
        expect(authToken).toBeUndefined()
        expect(certFile).toBeUndefined()
    })
})

test("test debug mode setting", () => {
    var configure = new Configuration()
    var impl = toImpl(configure)

    expect(impl.getUseDebug()).toBe(false)
    configure.setDebugState(true)
    expect(impl.getUseDebug()).toBe(true)
})

test("test debug mode settingfrom environment", () => {
    process.env["ATEL_USE_DEBUG"] = "1"
    var configure = new Configuration()
    var impl = toImpl(configure)

    expect(impl.getUseDebug()).toBe(true)
    configure.setDebugState(false)
    expect(impl.getUseDebug()).toBe(true)

    process.env["ATEL_USE_DEBUG"] = "0"
    var configure = new Configuration()
    var impl = toImpl(configure)

    expect(impl.getUseDebug()).toBe(false)
    configure.setDebugState(true)
    expect(impl.getUseDebug()).toBe(false)
})

test("verify the temporality flag", ()=> {
    var configure = new Configuration()
    var impl = toImpl(configure)
    expect(impl.getUseCumulativeMetrics()).toBe(false)
    configure.setUseCumulativeMetrics(true)
    expect(impl.getUseCumulativeMetrics()).toBe(true)
    process.env.ATEL_USE_CUMULATIVE_METRICS = "false"
    expect(impl.getUseCumulativeMetrics()).toBe(false)
    configure.setUseCumulativeMetrics(false)
    process.env.ATEL_USE_CUMULATIVE_METRICS = "true"
    expect(impl.getUseCumulativeMetrics()).toBe(true)
})
