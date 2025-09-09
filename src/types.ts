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
