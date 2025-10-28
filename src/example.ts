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
    traceBlockAsync,
    type ASpan
} from "./index.js"
import { changeSignalConnection } from "./signals.js"

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const config = new Configuration(new URL("devnull:")) // NOTE: devnull is a No-Op exporter.
        .setMetricExportIntervalMs(100)
        .setTraceEndpoint(new URL("http://localhost:6318/v1/traces"))
        .setMetricsEndpoint(new URL("http://localhost:6318/v1/metrics"))
    const res = new ResourceAttributes("test_aotel", "1.2.3").setAttributes({foo: "test"})

    initializeTelemetry(config, res, ["metrics", "tracing"])
    console.log("=== Running...EP #1")
    await traceBlockAsync({name: "topLevel", attributes: {"someKey": "someValue"}}, async (span: ASpan) => {
        recordHistogram({name: "myValue", value: 42})
        incrementCounter({name: "feature1"})
        await sleep(150)

        span.addEvent("Event1")

        incrementCounter({name: "feature1"})
        incrementCounter({name: "feature2"})
        await sleep(150)
        span.addEvent("Event2")

        decrementCounter({name: "feature1", by: 2})
    })
    await sleep(2500)
    console.log("=== Switching to EP #2.")
    await changeSignalConnection("metrics", new URL("http://localhost:5318/v1/metrics"))
    await changeSignalConnection("tracing", new URL("http://localhost:5318/v1/traces"))
    console.log("=== Running...EP #2")
    await traceBlockAsync({name: "newTopLevel", attributes: {"someNewKey": "someNewValue"}}, async (span: ASpan) => {
        recordHistogram({name: "myValue2", value: 42})
        incrementCounter({name: "new_feature1"})
        await sleep(150)

        span.addEvent("newEvent1")

        incrementCounter({name: "new_feature1"})
        incrementCounter({name: "new_feature2"})
        await sleep(150)
        span.addEvent("newEvent2")

        decrementCounter({name: "new_feature1", by: 2})
    })
    await sleep(1000)
    console.log("=== Done.")
}

await main()
