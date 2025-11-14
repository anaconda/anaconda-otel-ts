// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

// src/signals-state.ts
import type { AnacondaMetrics } from './metrics.js';
import type { AnacondaTrace } from './traces.js';

export let __initialized = false;
export let __metrics: AnacondaMetrics | undefined = undefined;
export let __tracing: AnacondaTrace | undefined = undefined;

// setters so other modules can update state (imports are read-only)
export function __setInitialized(v: boolean) { __initialized = v; }
export function __setMetrics(v: AnacondaMetrics | undefined) { __metrics = v; }
export function __setTracing(v: AnacondaTrace | undefined) { __tracing = v; }

export function __resetSignals(): void {
  __initialized = false;
  __metrics = undefined;
  __tracing = undefined;
}
