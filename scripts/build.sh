#!/bin/bash

# SPDX-FileCopyrightText: 2025 Anaconda, Inc
# SPDX-License-Identifier: Apache-2.0


cd "$(dirname $0)/.."
workdir="$(pwd)"

NPM=`which npm`
TSC=`which tsc`

[[ -z "${NPM}" ]] && echo "ERROR: Missing 'npm', please install Node.js for your system then rerun this script." >&2 && exit 2
[[ ! -d "./node_modules" ]] && echo "WARNING: Missing local Typescript environment, running './dev-setup.sh'." >&2 && ./dev-setup.sh

npm run clean
npm run build
npx typedoc
npm pack
cd docs
tar -vcaf ${workdir}/anaconda-opentelemetry-html-0.1.0.tgz *
cd -
