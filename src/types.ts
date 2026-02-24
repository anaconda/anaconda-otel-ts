// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

// Types for code readability...

/**
 * Represents the types a Attribute value may be.
 */
export type AttrValueType = string | number | boolean | Array<null | undefined | string> | Array<null | undefined | number> | Array<null | undefined | boolean>

/**
 * Represents a mapping of attribute names to their string values.
 *
 * Each key in the map is a string representing the attribute name,
 * and the corresponding value is a string representing the attribute's value.
 */
export type AttrMap = Record<string, AttrValueType>

/**
 * Represents a map of key-value pairs used for propagating
 * distributed tracing context.
 *
 * Typically used for HTTP headers or other transport mechanisms.
 */
export type CarrierMap = Record<string, string>

/**
 * Arguments defintion for most metric and tracing calls to add signal events.
 */
export class TraceArgs {
    /** Required: To name the specific event, must not be empty. */
    name: string = "";
    /** Optional: key value pairs for most APIs that take attributes. */
    attributes?: AttrMap = {};
}

/**
 * Possible signals used in this API.
 */
export type Signal = 'metrics' | 'tracing' | 'logging';

/**
 * This is the tracing context used for tracing both in and out of a process.
 */
export interface ASpan {
    /**
     * Sent a trace event in this context with the given name and attributes.
     *
     * @param name - Required: Must not be empty. This is the name of the trace
     *               event scoped to this context.
     * @param attributes - Optional: key/value Record for attributes on this event only.
     *
     * @example
     * ```typescript
     *      const ctx = createRootTraceContext({name: "mySpanName"})
     *      ctx.addEvent({ name: "MyEventName", attributes: { foo: "bar" }})
     *      ctx.end()
     * ```
     */
    addEvent(name: string, attributes?: AttrMap): void;

    /**
     * The method takes create a CarrierMap object (empty) and populates it with the carrier
     * for this span. This can be passed across process/host boundaries to continue
     * the span (associate with) on a another process or host (client/server models).
     *
     * @param carrier - Create an instance then pass into this method to populate it.
     *
     * @returns The current CarrierMap with the current context for this span object.
     *
     * @remarks
     * This method does not throw any known exceptions.
     *
     * @example
     * ```typescript
     *      const span = getSpan(name: "mySpanName")
     *      span.addEvent({ name: "MyEventName", attributes: { foo: "bar" }})
     *      const carrier = span.getCurrentSpan()
     *      // Send to remote server or across processes to continue sending event
     *      // for this context. You can still close it here as the other side will
     *      // have its own OTel objects that is must close. This allows for trace
     *      // association in distributed applications.
     *      ctx.end()
     * ```
     */
    getCurrentCarrier(): CarrierMap;

    /**
     *  Calling this ends this context. Calling other methods on this object afterward
     *  MAY cause an exception but WILL fail.
     */
    end(): void;
}
