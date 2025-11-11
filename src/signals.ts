// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { Configuration } from './config.js';
import { ResourceAttributes } from './attributes.js';
import { AnacondaMetrics, CounterArgs, HistogramArgs } from './metrics.js';
import { AnacondaTrace } from './traces.js';
import { localTimeString as lts } from './common.js';
import { type CarrierMap, type TraceContext, TraceArgs } from './types.js';

import {
  __initialized,
  __metrics,
  __tracing,
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
 * Create the root tracing object (can create more than one) used to send trace events and create child
 * TraceContext objects. The object `end()` must be called before the trace span can be sent to the collector.
 *
 * @param args - Required: An argument list with a required `name` key (non-empty) for the trace span name, and
 *               optional `attributes` to set any user attributes on the trace span.
 * @param carrier - Optional: This is a OTel carrier that can be recieved via message or HTTP headers from another
 *                  process or source. If unsure don't include this argument.
 * @remarks
 * This method does not throw any known exceptions.
 *
 * @example
 * ```typescript
 *      const ctx = createRootTraceContext({name: "myTraceSpanName"})
 *      ctx.addEvent({ name: "MyEventName", attributes: { foo: "bar" }})
 *      ctx.end()
 * ```
 * @returns The TraceContext object if successful, or undefined if not initialized.
 */
export function createRootTraceContext(args: TraceArgs, carrier: CarrierMap | undefined = undefined): TraceContext | undefined {
    if (!__tracing) {
        console.warn("*** WARNING: Tracing is not initialized. Call initializeTelemetry first.")
        return undefined
    }
    return __tracing.createRootTraceContext(args, carrier)
}

/**
 * This method will ignore any export time intervals and will immediatly flush cached data in memory
 * to the collector. Use sparingly but ALWAYS use it before your application exits.
 *
 * @remarks
 * This method does not throw any known exceptions.
 */
export function flushAllSignals(): void {
    __tracing?.flush()
    __metrics?.flush()
}
