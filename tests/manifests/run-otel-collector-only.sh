#!/bin/bash

dir=$(dirname $0)
outputDir="/tmp/otel-int-test"

cd "${dir}/../.."
runDir="$(pwd)"
manDir="${runDir}/tests/manifests"
clear

echo "Running in '${runDir}'..."

image_name="otel/opentelemetry-collector-contrib"
image_version="latest"
image="${image_name}:${image_version}"

found=`docker images | grep -e "${image_name}" | grep -e "${image_version}" | awk '{print $1 ":" $2}'`

if [ -z "${found}" ]; then
  echo "Image not found, getting image: ${image}"
  set -e
  docker pull "${image}"
  set +e
else
  echo "Image found: ${image}"
fi

mkdir -p "${outputDir}"
chmod 777 "${outputDir}"

echo ">>> Use Ctrl+C to stop the container <<<"
docker run -t --rm --name testingCollector \
  -v "${manDir}/otel-collector-config.yaml":/etc/otelcol/config.yaml \
  -v "${outputDir}":/tmp/otel-output \
  -p 127.0.0.1:4317:4317 -p 127.0.0.1:4318:4318 \
  "${image}" \
  --config /etc/otelcol/config.yaml
