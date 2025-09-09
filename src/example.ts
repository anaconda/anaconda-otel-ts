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
    traceBlock,
    ASpan
} from "./index"

function sleep(to: number) {
    setTimeout(() => { }, to)
}

function main() {
    const config = new Configuration(new URL("devnull:")) // NOTE: devnull is a No-Op exporter.
        .setMetricExportIntervalMs(100)
        .setTraceEndpoint(new URL("console:"))
        .setMetricsEndpoint(new URL("console:"))
    const res = new ResourceAttributes("test_aotel", "1.0.0").setAttributes({foo: "test"})

    initializeTelemetry(config, res, ["metrics", "tracing"])
    console.log("=== Running...")
    traceBlock({name: "topLevel", attributes: {"someKey": "someValue"}}, (span: ASpan) => {
        recordHistogram({name: "my-value", value: 42})
        incrementCounter({name: "feature-1"})
        sleep(150)

        span.addEvent("Event #1")

        incrementCounter({name: "feature-1"})
        incrementCounter({name: "feature-2"})
        sleep(150)
        span.addEvent("Event #2")

        decrementCounter({name: "feature-1", by: 2})
    })
    sleep(2000)
    console.log("=== Done.")
}

main()
