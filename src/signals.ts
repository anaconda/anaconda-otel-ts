// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { Configuration } from './config.js';
import { ResourceAttributes } from './attributes.js';
import { AnacondaMetrics, CounterArgs, HistogramArgs } from './metrics.js';
import { AnacondaTrace, type ASpan, TraceArgs } from './traces.js';
import { localTimeString as lts } from './common.js';

import {
  __initialized,
  __metrics,
  __tracing,
  __noopASpan,
  __setInitialized,
  __setMetrics,
  __setTracing,
} from './signals-state.js';


/**
 * Possible signals used in this API.
 */
export type Signal = 'metrics' | 'tracing';

/**
 * Initializes telemetry signals such as metrics and traces based on the provided configuration.
 *
 * @param config - The telemetry configuration object.
 * @param attributes - Resource attributes to associate with telemetry data.
 * @param signalTypes - An array of signal types to initialize (e.g., "metrics", "tracing"). Defaults to ["metrics"].
 *
 * @returns true is successful, otherwise false.
 *
 * @remarks
 * - If telemetry has already been initialized, this function does nothing.
 * - Currently, only metrics initialization is implemented; tracing is a placeholder.
 * - Unknown signal types will trigger a warning in the console.
 */
export function initializeTelemetry(config: Configuration,
                                    attributes: ResourceAttributes,
                                    signalTypes: Array<Signal> = ["metrics"]): boolean {
    console.debug(`${lts()} > *** initializeTelemetry called...`)
    if (__initialized) {
        console.debug(`${lts()} > *** already initialized, returning true.`)
        return true // If already initialized, do nothing.
    }
    for (const signalType of signalTypes) {
        switch (signalType) {
            case "metrics":
               __setMetrics(new AnacondaMetrics(config, attributes))

                break;
            case "tracing":
                __setTracing(new AnacondaTrace(config, attributes))
                break
            // default:
            //     console.warn(`${lts()} > *** WARNING: Unknown signal type: ${signalType}`)
            //     break
        }
    }
    if (!__metrics && !__tracing) {
        console.warn(`${lts()} > *** WARNING: No telemetry signals initialized. Ensure at least one signal type is specified.`)
        return false
    }
    __setInitialized(true) // Mark as initialized
    console.debug(`${lts()} > *** initializeTelemetry finished.`)
    return true
}

/**
 * Reinitializes telemetry components (metrics and tracing) with updated resource attributes.
 *
 * This function updates the internal telemetry resources only if telemetry
 * has already been initialized. If telemetry is not yet initialized, it will
 * return `false` and perform no changes.
 *
 * @deprecated Please use the new method, changeSignalConnection()! This will be removed after
 *             2-3 releases and currently does nothing but return `false`.
 *
 * @param newAttributes - The new {@link ResourceAttributes} to apply to telemetry components.
 * @param newEndpoint - A possible default endpoint replacement.
 * @param newToken - A possible default token replacemennt.
 *
 * @returns `true` if telemetry was already initialized and reinitialization was performed,
 *          otherwise `false`.
 *
 * @remarks
 * - ___IMPORTANT___: This function fails with an exception if tracing is enabled and
 *   the code this method is called from is in a `traceBlock`. There is currently
 *   no way to unwrap the traceBlock stack.
 * - This function is safe to call multiple times, but it will only take effect
 *   after the initial telemetry setup has been completed.
 * - Both metrics and tracing components will be reinitialized if present.
 *
 * @throws Error - when inside a traceBlock!
 */
export function reinitializeTelemetry(newAttributes: ResourceAttributes,
                                      newEndpoint: URL | undefined = undefined,
                                      newToken: string | undefined = undefined): boolean {
    console.warn("DEPRECATED: The 'reinitializeTelemetry' function no longer does anything!")
    return false
}

/**
 * Function used to change the endpoint or authorization token or both for a signal type.
 *
 * @param signal - Either 'metrics' or 'tracing' to select which connection to change.
 * @param endpoint - The optional new endpoint for the specific signal.
 * @param authToken - The optional new authorization token for the connection to use.
 * @param certFile - The optional certificate file for mTLS.
 *
 * @returns - true if successful, false if it failed.
 *
 * @remarks
 *  - Should be called from an async method with await, if not consequences are:
 *      * If changing endpoints data around the change MAY end up in either endpoint or both.
 *      * Order of other telemetry may be different than expected.
 *  - This method does not throw.
 */
export async function changeSignalConnection(signal: Signal, endpoint: URL | undefined,
                                             authToken: string | undefined = undefined,
                                             certFile: string | undefined = undefined): Promise<boolean> {
    if (!__initialized) {
        return false
    }
    if (signal === 'metrics') {
        return await __metrics?.changeConnection(endpoint, authToken, certFile) ?? false
    } else {
        return await __tracing?.changeConnection(endpoint, authToken, certFile) ?? false
    }
}

/**
 * Records a value in a histogram metric with optional attributes.
 *
 * @param args - An argument list object where the `name` field is required.
 *
 * The args is an object defined by (in any order):
 * ```
 * {
 *   name: string = "";  Required; Not supplying a name will result in no value being recorded.
 *   value: number = 0;  Required; This field will be recorded as the value.
 *   attributes?: AttrMap = {}; Optional; Attributes for the value metric.
 * }
 * ```
 *
 * @returns `true` if the histogram was recorded successfully, `false` if metrics are not initialized.
 *
 * @example
 * ```typescript
 * recordHistogram({name: "validName", value: 42.0, attributes: { "name": "Value" }})
 * ```
 */
export function recordHistogram(args: HistogramArgs): boolean {
    if (!__metrics) {
        console.warn("*** WARNING: Metrics not initialized. Call initializeTelemetry first.")
        return false
    }
    return __metrics.recordHistogram(args); // Call the recordHistogram method on the AnacondaMetrics instance
}

/**
 * Increments a named counter by a specified value and optional attributes.
 *
 * @param args - An argument list object where the `name` field is required.
 *
 * The args is an object defined by (in any order):
 *
 * ```
 * {
 *   name: string = "";  Required; Not supplying a name will result in no value being recorded.
 *   by?: number = 1;  Optional; Not supplying this field will result in the counter being incremented by `1`.
 *   forceUpDownCounter?: boolean = false;  Optional; Counters by default are incrementing only, set to `true` to force an updown counter.
 *   attributes?: AttrMap = {}; Optional; Attributes for the counter metric.
 * }
 * ```
 *
 * @returns `true` if the counter was incremented successfully, `false` if metrics are not initialized.
 *
 * @example
 * ```typescript
 * // Creates a incrementing only counter set to `1` or increments an existing counter by `1`.
 * incrementCounter({name: "validName"})
 *
 * // Creates a incrementing and decrementing counter set to `1` or increments an existing counter by `1`.
 * incrementCounter({forceUpDown: true, name: "upDownValidName", attributes: {"name": "value"}})
 *
 * // Creates a incrementing and decrementing counter set to `5` or increments an existing counter by `5`.
 * incrementCounter({by: 5, name: "newCounter", forceUpDown: true})
 * ```
 */
export function incrementCounter(args: CounterArgs): boolean {
    if (!__metrics) {
        console.warn("*** WARNING: Metrics not initialized. Call initializeTelemetry first.")
        return false
    }
    return __metrics.incrementCounter(args); // Call the incrementCounter method on the AnacondaMetrics instance
}

/**
 * Decrements the specified counter by a given value.
 *
 * @param args - An argument list object where the `name` field is required.
 *
 * The args is an object defined by (in any order):
 *
 * ```
 * {
 *   name: string = "";  Required; Not supplying a name will result in no value being recorded.
 *   by?: number = 1;  Optional; Not supplying this field will result in the counter being incremented by `1`.
 *   forceUpDownCounter?: boolean = true;  Optional; Reguardless of this value, an up down counter will be created.
 *   attributes?: AttrMap = {}; Optional; Attributes for the counter metric.
 * }
 * ```
 *
 * @returns `true` if the counter was decremented successfully, `false` if metrics are not initialized.
 *
 * @example
 * ```typescript
 * // Creates an up down counter set to -2, or decrements the already created counter by `2`.
 * decrementCounter({name: "validName", by: 2, attributes: {"name": "value"}})
 * ```
 */
export function decrementCounter(args: CounterArgs): boolean {
    if (!__metrics) {
        console.warn("*** WARNING: Metrics not initialized. Call initializeTelemetry first.")
        return false
    }
    return __metrics.decrementCounter(args); // Call the decrementCounter method on the AnacondaMetrics instance
}

/**
 * Executes a block of code (async) within a tracing context, optionally attaching
 * attributes and a carrier.
 *
 * @param args - An argument list object where the `name` field is required.
 *
 * The args is an object defined by (in any order):
 *
 * ```
 * {
 *   name: string = "";  Required; Not supplying a name will result in no value being recorded.
 *   attributes?: AttrMap = {}; Optional; Attributes for the counter metric.
 *   carrier?: CarrierMap = {}; Optional; Used to create a context for the trace block.
 * }
 * ```
 *
 * @remarks
 * - If tracing is not initialized, a warning is logged and the block is executed with a no-op span.
 * - ___IMPORTANT___: Calling `reinitializeTelemetry` from within a traceBlock will result in an
 *   exception (Error) being thrown!
 * - This call should be awaited and the code block will be async.
 *
 * @example
 * ```typescript
 * await traceBlock({name: "myTraceBlock", attributes: { key: "value" }}) { aspan =>
 *     aspan.addAttributes({ additional: "attributes" });
 *     // do some async code here with awaits...
 *
 *     aspan.addEvent("eventName", { "attr": "value" });
 *
 *     // do some more code with awaits...
 *
 *     aspan.addException(new Error("An error occurred"));
 *     aspan.setErrorStatus("An error occurred");
 *
 *     // finish the code block
 * })
 * ```
 */
export async function traceBlockAsync(args: TraceArgs, block: (aspan: ASpan) => Promise<void>): Promise<void> {
    if (!__tracing) {
        console.warn("*** WARNING: Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.");
        await block(__noopASpan); // Call the block with undefined to maintain API consistency
        return
    }
    return await __tracing.traceBlockAsync(args, block); // Call the traceBlock method on the AnacondaTrace instance
}

/**
 * Executes a block of code (async) within a tracing context, optionally attaching
 * attributes and a carrier.
 *
 * @param args - An argument list object where the `name` field is required.
 *
 * The args is an object defined by (in any order):
 *
 * ```
 * {
 *   name: string = "";  Required; Not supplying a name will result in no value being recorded.
 *   attributes?: AttrMap = {}; Optional; Attributes for the counter metric.
 *   carrier?: CarrierMap = {}; Optional; Used to create a context for the trace block.
 * }
 * ```
 *
 * @remarks
 * - If tracing is not initialized, a warning is logged and the block is executed with a no-op span.
 * - ___IMPORTANT___: Calling `reinitializeTelemetry` from within a traceBlock will result in an
 *   exception (Error) being thrown!
 * - This call should be awaited and the code block will be async.
 *
 * @example
 * ```typescript
 * await traceBlock({name: "myTraceBlock", attributes: { key: "value" }}) { aspan =>
 *     aspan.addAttributes({ additional: "attributes" });
 *     // do some async code here with awaits...
 *
 *     aspan.addEvent("eventName", { "attr": "value" });
 *
 *     // do some more code with awaits...
 *
 *     aspan.addException(new Error("An error occurred"));
 *     aspan.setErrorStatus("An error occurred");
 *
 *     // finish the code block
 * })
 * ```
 */
export function traceBlock(args: TraceArgs, block: (aspan: ASpan) => void): void {
    if (!__tracing) {
        console.warn("*** WARNING: Tracing not initialized. Call initializeTelemetry with 'tracing' signal type first.");
        block(__noopASpan); // Call the block with undefined to maintain API consistency
        return
    }
    return __tracing.traceBlock(args, block); // Call the traceBlock method on the AnacondaTrace instance
}
