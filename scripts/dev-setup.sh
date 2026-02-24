#!/bin/bash

# SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
# SPDX-License-Identifier: Apache-2.0

cd "$(dirname $0)/.."

NPM=`which npm`

[[ -z "${NPM}" ]] && echo "ERROR: Missing 'npm', please install Node.js for your system then rerun this script." >&2 && exit 2

${NPM} install --save-dev jest ts-jest @types/jest typescript typedoc @opentelemetry/api @opentelemetry/sdk-node \
        @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/sdk-metrics \
        @opentelemetry/exporter-metrics-otlp-http @opentelemetry/exporter-metrics-otlp-grpc
