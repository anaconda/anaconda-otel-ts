// SPDX-FileCopyrightText: 2025 Anaconda, Inc
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
 * This is the tracing context used for tracing both in and out of a process.
 */
export interface TraceContext {
    /**
     * Sent a trace event in this context with the given name and attributes.
     *
     * @param name - Required: Must not be empty. This is the name of the trace
     *               event scoped to this context.
     * @param attributes - Optional: key/value Record for attributes on this event only.
     *
     * @example
     * ```typescript
     *      const ctx = createRootTraceContext({name: "myTraceSpanName"})
     *      ctx.addEvent({ name: "MyEventName", attributes: { foo: "bar" }})
     *      ctx.end()
     * ```
     */
    addEvent(name: string, attributes?: AttrMap): void;

    /**
     * Create a new child TraceContext with the parent being this TraceContext.
     *
     * @param args - Required: An argument list with a required `name` key (non-empty) for
     *               the trace span name, and optional `attributes` to set any user
     *               attributes on the trace span.
     *
     * @remarks
     *  No carrier is needed because this is based on the parent context. No known
     *  exceptions are thrown.
     */
    createChildTraceContext(args: TraceArgs): TraceContext;

    /**
     * The method takes a CarrierMap object (empty) and populates it with the carrier
     * for this context. This can be passed across process/host boundaries to continue
     * the context (associate with) on a another process or host (client/server models).
     *
     * @param carrier - Create an pass this into this method to populate it.
     *
     * @remarks
     * This method does not throw any known exceptions.
     *
     * @example
     * ```typescript
     *      const ctx = createRootTraceContext({name: "myTraceSpanName"})
     *      ctx.addEvent({ name: "MyEventName", attributes: { foo: "bar" }})
     *      const carrier = {}
     *      ctx.inject(carrier)
     *      // Send to remote server or across processes to continue sending event
     *      // for this context. You can still close it here as the other side will
     *      // have its own OTel objects that is must close. This allows for trace
     *      // association in distributed applications.
     *      ctx.end()
     * ```
     */
    inject(carrier: CarrierMap): void;

    /**
     *  Calling this ends this context. Calling other methods on this object afterward
     *  MAY cause an exception but WILL fail.
     */
    end(): void;
}
