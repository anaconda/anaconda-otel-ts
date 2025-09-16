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
    public forEachMetricsEndpointsTest(callback: (endpoint: URL, authToken: string | undefined, certFile: string | undefined) => void): void {
        super.forEachMetricsEndpoints(callback)
    }
    public forEachTraceEndpointsTest(callback: (endpoint: URL, authToken: string | undefined, certFile: string | undefined) => void): void {
        super.forEachTraceEndpoints(callback)
    }

    public testDebug(line: string) {
        var saved = console.debug
        console.debug = jest.fn()
        this.debug(line)
        console.debug = saved
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
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    const common = new TestImpl(config, attributes)

    expect(common).toBeDefined()
    expect(common.getConfig()).toBeInstanceOf(InternalConfiguration)
    expect(common.getAttributes()).toBeInstanceOf(InternalResourceAttributes)
    expect(common.getResources()).toBeDefined()
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

test("Verify AnacondaCommon forEachMetricsEndpoints", () => {
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    const common = new TestImpl(config, attributes)

    const mockCallback = jest.fn()
    common.forEachMetricsEndpointsTest(mockCallback)

    expect(mockCallback).toHaveBeenCalledTimes(1) // No endpoints set, should not call the callback
    expect(mockCallback).toHaveBeenCalledWith(new URL("grpc://localhost:4317"), undefined, undefined)

    // Set a metrics endpoint and verify the callback is called
    config.setMetricsEndpoint(new URL("http://localhost:4317"), "authToken", "certFile.pem")
    common.forEachMetricsEndpointsTest(mockCallback)

    expect(mockCallback).toHaveBeenCalledTimes(2)
    expect(mockCallback).toHaveBeenCalledWith(new URL("http://localhost:4317"), "authToken", "certFile.pem")
})

test("Verify AnacondaCommon forEachTraceEndpoints", () => {
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    const common = new TestImpl(config, attributes)

    const mockCallback = jest.fn()
    common.forEachTraceEndpointsTest(mockCallback)

    expect(mockCallback).toHaveBeenCalledTimes(1) // No endpoints set, should not call the callback
    expect(mockCallback).toHaveBeenCalledWith(new URL("grpc://localhost:4317"), undefined, undefined) // Default endpoint

    // Set a trace endpoint and verify the callback is called
    config.setTraceEndpoint(new URL("http://localhost:4318"), "authToken", "certFile.pem")
    common.forEachTraceEndpointsTest(mockCallback)

    expect(mockCallback).toHaveBeenCalledTimes(2)
    expect(mockCallback).toHaveBeenCalledWith(new URL("http://localhost:4318"), "authToken", "certFile.pem")
})

test("verify turn on debug mode", () => {
    process.env["ATEL_USE_DEBUG"] = "1"
    const config = new Configuration()
    const attributes = new ResourceAttributes("test_service", "0.0.0")
    const common = new TestImpl(config, attributes)

    common.testDebug("some debug line")
})
