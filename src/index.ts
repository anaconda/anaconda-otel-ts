// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

// Expose public API here...
export * from './types.js';
export { Configuration } from './config.js';
export { ResourceAttributes } from './attributes.js';
export { LogArgs, EventArgs, type ATelLogger } from './logging.js'
export {
    initializeTelemetry,
    changeSignalConnection,
    recordHistogram,
    decrementCounter,
    incrementCounter,
    getTrace,
    flushAllSignals,
    getATelLogger,
    sendEvent
} from './signals.js';

export { sdkVersion as ATEL_SDK_VERSION, schemaVersion as ATEL_SCHEMA_VERSION } from './__version__.js'
