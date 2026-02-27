#!/usr/bin/env node

// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import {
    Configuration,
    decrementCounter,
    incrementCounter,
    initializeTelemetry,
    recordHistogram,
    ResourceAttributes,
    changeSignalConnection,
    getTrace,
    flushAllSignals,
    sendEvent,
    getATelLogger
} from "./index.js"

// Internal for testing
import { type Signal } from "./types.js"

const HOST: string = process.env.EXAMPLE_HOST ?? "localhost";
const PORT1: string = process.env.EXAMPLE_PORT1 ?? "6318";
const PORT2: string = process.env.EXAMPLE_PORT2 ?? "5318";
const TEST_METRICS: string = process.env.EXAMPLE_TEST_METRICS ?? "yes"
const TEST_TRACES: string = process.env.EXAMPLE_TEST_TRACES ?? "yes"
const TEST_LOGS: string = process.env.EXAMPLE_TEST_LOGS ?? "yes"

const sleepMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const config = new Configuration(new URL("devnull:")) // NOTE: devnull is a No-Op exporter.
        .setMetricExportIntervalMs(1000)
        .setTraceExportIntervalMs(1000)
        .setLoggingExportIntervalMs(1000)
        .setTraceEndpoint(new URL(`http://${HOST}:${PORT1}/v1/traces`))
        .setMetricsEndpoint(new URL(`http://${HOST}:${PORT1}/v1/metrics`))
        .setLoggingEndpoint(new URL(`http://${HOST}:${PORT1}/v1/logs`))
    const res = new ResourceAttributes("test_aotel", "1.2.3")
        .setAttributes({foo: "test", userId: "exampleUser"})
    var signals: Signal[] = []
    if (TEST_METRICS === "yes") { signals.push("metrics") }
    if (TEST_TRACES === "yes") { signals.push("tracing") }
    if (TEST_LOGS === "yes") { signals.push("logging") }

    initializeTelemetry(config, res, signals)
    let log = getATelLogger()
    console.log("=== Running...EP #1")

    if (TEST_LOGS === "yes") {
        sendEvent({eventName: "Testing #1", payload: {"key": "value"}})
    }
    log?.trace({message: "TRACE"})
    log?.debug({message: "DEBUG"})
    log?.info({message: "INFO"})
    await sleepMs(250)
    log?.warn({message: "WARN"})
    log?.error({message: "ERROR"})
    await sleepMs(250)
    log?.fatal({message: "FATAL"})

    let parent = getTrace("topLevel")

    if (TEST_METRICS === "yes") {
        recordHistogram({name: "myValue", value: 42})
        incrementCounter({name: "feature1", forceUpDownCounter: true})
    }

    parent?.addEvent("Event1")

    let child = getTrace("child", { parentObject: parent })
    child?.addEvent("child.event.1")
    child?.addEvent("child.event.3")
    child?.addEvent("child.event.2")
    child?.end()

    if (TEST_METRICS === "yes") {
        incrementCounter({name: "feature1"})
        incrementCounter({name: "feature2", attributes: {"http.method": "POST"}})
    }
    parent?.addEvent("Event2")

    if (TEST_METRICS === "yes") {
        decrementCounter({name: "feature1", by: 2})
    }

    flushAllSignals()

    console.log("=== Switching to EP #2.")
    if (TEST_METRICS === "yes") {
        await changeSignalConnection("metrics", { endpoint: new URL(`http://${HOST}:${PORT2}/v1/metrics`), userId: "newUser" })
    }
    if (TEST_TRACES === "yes") {
        await changeSignalConnection("tracing", { endpoint: new URL(`http://${HOST}:${PORT2}/v1/traces`), userId: "newUser" })
    }
    if (TEST_LOGS === "yes") {
        await changeSignalConnection("logging", { endpoint: new URL(`http://${HOST}:${PORT2}/v1/logs`), userId: "newUser" })
    }
    console.log("=== Running...EP #2")

    if (TEST_LOGS === "yes") {
        sendEvent({eventName: "Testing #2", payload: {"key": "value"}})
    }
    log?.trace({message: "TRACE #2"})
    log?.debug({message: "DEBUG #2"})
    log?.info({message: "INFO# #2"})
    await sleepMs(250)
    log?.warn({message: "WARN #2"})
    log?.error({message: "ERROR #2"})
    await sleepMs(250)
    log?.fatal({message: "FATAL #2"})

    if (TEST_METRICS === "yes") {
        recordHistogram({name: "myValue2", value: 42})
        incrementCounter({name: "newfeature1", forceUpDownCounter: true, attributes: {"http.method": "POST"}})
    }
    parent?.addEvent("newEvent1")
    child = getTrace("newChild", { parentObject: parent })
    child?.addEvent("newChild.event.1")
    child?.addEvent("newChild.event.2")
    child?.end()

    if (TEST_METRICS === "yes") {
        incrementCounter({name: "newfeature1"})
        incrementCounter({name: "newfeature2"})
    }
    parent?.addEvent("newEvent2")

    if (TEST_METRICS === "yes") {
        decrementCounter({name: "newfeature1", by: 2})
    }

    parent?.end()
    flushAllSignals()
    console.log("=== Done.")
}

await main()
