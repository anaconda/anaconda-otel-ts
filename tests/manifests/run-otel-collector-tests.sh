#!/bin/bash

dir=$(dirname $0)
outputDir="./.tmp"

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

rm -rf "${outputDir}"
mkdir -p "${outputDir}"
chmod 777 "${outputDir}"

docker run -d --rm --name testingCollector \
  -v "${manDir}/otel-collector-config.yaml":/etc/otelcol/config.yaml \
  -v "${outputDir}":/tmp \
  -p 127.0.0.1:4317:4317 -p 127.0.0.1:4318:4318 \
  "${image}" \
  --config /etc/otelcol/config.yaml

[[ $? != 0 ]] && echo "ERROR: container failed to launch!" && exit 2

echo "Waiting for container start..."
sleep 2

docker ps
npm run test:integration
rv=$?
sleep 2
docker stop testingCollector >/dev/null

[[ ${rv} == 0 ]] && echo "PASSED" && exit 0
echo "FAILED"
exit 2
