// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';                    // ESM import
import { jest, expect, beforeAll, afterAll } from '@jest/globals';

import { Configuration, InternalConfiguration } from '../../src/config'
import { ResourceAttributes, InternalResourceAttributes } from '../../src/attributes';
import { AnacondaCommon } from '../../src/common';

import { type Resource } from '@opentelemetry/resources'

class TestImpl extends AnacondaCommon {
    public constructor(config: Configuration, attributes: ResourceAttributes) {
        super(config, attributes)
    }

    public getConfig(): InternalConfiguration {
        return this.config
    }
    public getAttributes(): InternalResourceAttributes {
        return this.attributes;
    }
    public getResources(): Resource {
        return this.resources
    }
    public get serviceNameTest(): string {
        return this.serviceName
    }
    public get serviceVersionTest(): string {
        return this.serviceVersion
    }
    public get useConsoleTest(): boolean {
        return this.useConsole
    }
    public get metricsExportIntervalMsTest(): number {
        return this.metricsExportIntervalMs
    }
    public get skipInternetCheckTest(): boolean {
        return this.skipInternetCheck
    }
    public readCertFileTest(certFile: string): string | undefined {
        return this.readCertFile(certFile)
    }

    public testDebug(line: string) {
        var saved = console.debug
        console.debug = jest.fn()
        this.debug(line)
        console.debug = saved
    }

    public testMakeNewResources(newAttributes: ResourceAttributes): void {
        this.makeNewResource(newAttributes)
    }

    public exposedUrlTest(urlStr: string): boolean {
        return this.isValidOtelUrl(urlStr)
    }
}

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    fs.writeFileSync('cert.pem', 'mocked certificate content')
})

afterAll(() => {
    fs.unlink('cert.pem', () => { /* Do Nothing */ })
})

test("Verify AnacondaCommon Constructor", () => {
    var config = new Configuration()
    var attributes = new ResourceAttributes("test_service", "0.0.0")
    var common = new TestImpl(config, attributes)

    expect(common).toBeDefined()
    expect(common.getConfig()).toBeInstanceOf(InternalConfiguration)
    expect(common.getAttributes()).toBeInstanceOf(InternalResourceAttributes)
    expect(common.getResources()).toBeDefined()

    process.env['ATEL_TRACING_SESSION_ENTROPY'] = "entropy"
    config = new Configuration()
    common = new TestImpl(config, attributes)
    common.testMakeNewResources(attributes)
})

test("Verify AnacondaCommon Getters", () => {
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    const common = new TestImpl(config, attributes)

    expect(common.serviceNameTest).toBe("test_service")
    expect(common.serviceVersionTest).toBe("0.0.0")
    expect(common.useConsoleTest).toBe(false)
    expect(common.metricsExportIntervalMsTest).toBe(60000) // Default value
    expect(common.skipInternetCheckTest).toBe(false)
})

test("Verify AnacondaCommon readCertFile", async () => {
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    const common = new TestImpl(config, attributes)
    const result = common.readCertFileTest('')
    expect(result).toBeUndefined() // No file provided, should return undefined

    const certContent = common.readCertFileTest("cert.pem")
    expect(certContent).toBe("mocked certificate content")

    // Verify error handling
    const certContentError = common.readCertFileTest("non_existent_cert_file.pem")
    expect(certContentError).toBeUndefined()
})

test("verify turn on debug mode", () => {
    process.env["ATEL_USE_DEBUG"] = "1"
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    const common = new TestImpl(config, attributes)

    common.testDebug("some debug line")
})

test("valid URL testing", ()=> {
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    let ut = new TestImpl(config, attributes)

    // Positive Cases
    const posUrls = [
        "console:",
        "devnull:",
        "http://localhost/v1/metrics",
        "http://localhost:2118/v1/logs",
        "http://127.0.0.1:2118/v1/traces",
        "https://some.website.test:2118/v1/metrics",
        "https://some.website.test/v1/metrics",
        "grpc://localhost/",
        "grpc://localhost:2118/",
        "grpc://127.0.0.1:2118/",
        "grpcs://some.website.test:2118/",
        "grpcs://some.website.test:2118/",
        "grpcs://some.website.test/",
    ]
    for (const url of posUrls) {
        expect(ut.exposedUrlTest(url)).toBe(true)
    }

    // Negative Cases
    const negUrls = [
        "bad:",
        "http://localhost/",
        "http://me/v1/metrics",
        "http://me:2118/v1/logs",
        "http://256.0.0.1:2118/v1/traces",
        "https://some.website.test:2118/v2/metrics",
        "https://some.website.test:211834/v1/metrics",
        "https://some.website.test/v1/bad",
        "grpc://localhost/v1/metrics",
        "grpc://localhost:2118/v1/logs",
        "grpc://256.0.0.1:2118/",
        "grpcs://some.website.test:2118/v2",
        "grpcs://some.website.test:211867/",
        "not-a-url",
        "   ",
        "",
    ]
    for (const url of negUrls) {
        expect(ut.exposedUrlTest(url)).toBe(false)
    }
})
