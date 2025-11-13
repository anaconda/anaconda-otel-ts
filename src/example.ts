#!/usr/bin/env node

// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import {
    Configuration,
    decrementCounter,
    incrementCounter,
    initializeTelemetry,
    recordHistogram,
    ResourceAttributes,
    changeSignalConnection,
    createRootTraceContext,
    flushAllSignals,
    type TraceContext
} from "./index.js"

async function main() {
    const config = new Configuration(new URL("devnull:")) // NOTE: devnull is a No-Op exporter.
        .setMetricExportIntervalMs(100)
        .setTraceEndpoint(new URL("http://localhost:6318/v1/traces"))
        .setMetricsEndpoint(new URL("http://localhost:6318/v1/metrics"))
    const res = new ResourceAttributes("test_aotel", "1.2.3")
        .setAttributes({foo: "test", userId: "exampleUser"})

    initializeTelemetry(config, res, ["metrics", "tracing"])
    console.log("=== Running...EP #1")
    let parent = createRootTraceContext({name: "topLevel"})!
    recordHistogram({name: "myValue", value: 42})
    incrementCounter({name: "feature1"})

    parent.addEvent("Event1")

    let child = parent.createChildTraceContext({name: "child"})
    child.addEvent("child.event.1")
    child.addEvent("child.event.3")
    child.addEvent("child.event.2")
    child.end()

    incrementCounter({name: "feature1"})
    incrementCounter({name: "feature2"})
    parent.addEvent("Event2")

    decrementCounter({name: "feature1", by: 2})

    console.log("=== Switching to EP #2.")
    await changeSignalConnection("tracing", { endpoint: new URL("http://localhost:5318/v1/traces") })
    await changeSignalConnection("metrics", { endpoint: new URL("http://localhost:5318/v1/metrics") })
    console.log("=== Running...EP #2")

    recordHistogram({name: "myValue2", value: 42})
    incrementCounter({name: "new_feature1"})

    parent.addEvent("newEvent1")
    child = parent.createChildTraceContext({name: "newChild"})
    child.addEvent("newChild.event.1")
    child.addEvent("newChild.event.2")
    child.end()

    incrementCounter({name: "new_feature1"})
    incrementCounter({name: "new_feature2"})
    parent.addEvent("newEvent2")

    decrementCounter({name: "new_feature1", by: 2})

    parent.end()
    flushAllSignals()
    console.log("=== Done.")
}

await main()
