// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { ResourceAttributes, InternalResourceAttributes, toImpl } from '../../src/attributes.js'
import * as os from 'os'
import { jest, expect } from '@jest/globals';

// Mock the version module
jest.mock('../../src/__version__.js', () => ({
    sdkVersion: '0.0.0',
    schemaVersion: '0.2.0'
}))

beforeEach(() => {
    // Clear lookup list of created ResourceAttributes objects
    for (const key in InternalResourceAttributes.__lookupImpl) {
        delete InternalResourceAttributes.__lookupImpl[key]
    }
    // Reset new id counter
    InternalResourceAttributes.__nextId = 0
})

test("Verify Initial State", () => {
    expect(InternalResourceAttributes.__nextId).toBe(0)
    expect(InternalResourceAttributes.__lookupImpl).toBeDefined()
    var length = Object.keys(InternalResourceAttributes.__lookupImpl).length
    expect(length).toBe(0)

    var attrs = new ResourceAttributes("test-service", "0.0.0")
    var impl = toImpl(attrs)
    expect(impl).toBeDefined()
    expect(impl.serviceName).toBe("test-service")
    expect(impl.serviceVersion).toBe("0.0.0")
    expect(impl.clientSdkVersion).toBe("0.0.0")
    expect(impl.schemaVersion).toBe("0.2.0")

    length = Object.keys(InternalResourceAttributes.__lookupImpl).length
    expect(InternalResourceAttributes.__nextId).toBe(1)
    expect(length).toBe(1)
})

test("Verify Default Values Population", () => {
    var attrs = new ResourceAttributes("my-service", "2.0.0")
    var impl = toImpl(attrs)

    expect(impl.osType).toBe(os.type())
    expect(impl.osVersion).toBe(os.release())
    expect(impl.nodeVersion).toBe(process.version)
    expect(impl.hostname).toBe(os.hostname())
    expect(impl.platform).toBe("")
    expect(impl.environment).toBe("")
    expect(impl.userId).toBe("")
})

test("Verify Custom Values Override Defaults", () => {
    var attrs = new ResourceAttributes(
        "my-service",
        "2.0.0",
        "Linux",
        "5.10",
        "v16.0.0",
        "custom-host",
        "aws",
        "production",
        "user123"
    )
    var impl = toImpl(attrs)

    expect(impl.osType).toBe("Linux")
    expect(impl.osVersion).toBe("5.10")
    expect(impl.nodeVersion).toBe("v16.0.0")
    expect(impl.hostname).toBe("custom-host")
    expect(impl.platform).toBe("aws")
    expect(impl.environment).toBe("production")
    expect(impl.userId).toBe("user123")
})

test("Verify Invalid Service Name Throws Error", () => {
    expect(() => new ResourceAttributes("my service!", "1.0.0"))
        .toThrow("serviceName not set. my service! is invalid regex for this key: `^[a-zA-Z0-9._-]{1,30}$`. This is a required parameter")

    expect(() => new ResourceAttributes("", "1.0.0"))
        .toThrow("serviceName not set.  is invalid regex for this key: `^[a-zA-Z0-9._-]{1,30}$`. This is a required parameter")

    var longName = "a".repeat(31)
    expect(() => new ResourceAttributes(longName, "1.0.0"))
        .toThrow(`serviceName not set. ${longName} is invalid regex for this key: \`^[a-zA-Z0-9._-]{1,30}$\`. This is a required parameter`)
})

test("Verify Invalid Service Version Throws Error", () => {
    expect(() => new ResourceAttributes("my-service", "1.0.0 beta"))
        .toThrow("serviceVersion not set. 1.0.0 beta is invalid regex for this key: `^[a-zA-Z0-9._-]{1,30}$`. This is a required parameter")

    expect(() => new ResourceAttributes("my-service", ""))
        .toThrow("serviceVersion not set.  is invalid regex for this key: `^[a-zA-Z0-9._-]{1,30}$`. This is a required parameter")
})

test("Verify Environment Validation and Normalization", () => {
    var validEnvironments = ["", "test", "development", "staging", "production"]

    for (let env of validEnvironments) {
        var attrs = new ResourceAttributes("service", "1.0", "", "", "", "", "", env)
        var impl = toImpl(attrs)
        expect(impl.environment).toBe(env)
    }
})

test("Verify Environment Normalization to Lowercase", () => {
    var attrs = new ResourceAttributes("service", "1.0", "", "", "", "", "", "PRODUCTION")
    var impl = toImpl(attrs)
    expect(impl.environment).toBe("production")

    attrs = new ResourceAttributes("service", "1.0", "", "", "", "", "", "TEST")
    impl = toImpl(attrs)
    expect(impl.environment).toBe("test")
})

test("Verify Invalid Environment Sets Empty String with Warning", () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

    // Test setAttributes
    var attrs = new ResourceAttributes("service", "1.0", "", "", "", "", "", "")
    attrs.setAttributes({ environment: "invalid" })
    var impl = toImpl(attrs)

    expect(impl.environment).toBe("")
    expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid environment value `invalid`, setting to empty string. Environment must be in ["", "test", "development", "staging", "production"]'
    )

    // Test constructor
    var attrs = new ResourceAttributes("service", "1.0", "", "", "", "", "", "invalid")
    var impl = toImpl(attrs)

    expect(impl.environment).toBe("")
    expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid environment value `invalid`, setting to empty string. Environment must be in ["", "test", "development", "staging", "production"]'
    )

    consoleSpy.mockRestore()
})

test("Verify setAttributes with Known Attributes", () => {
    var attrs = new ResourceAttributes("service", "1.0")

    attrs.setAttributes({
        environment: "staging",
        userId: "user456",
        platform: "gcp"
    })

    var impl = toImpl(attrs)
    expect(impl.environment).toBe("staging")
    expect(impl.userId).toBe("user456")
    expect(impl.platform).toBe("gcp")
})

test("Verify setAttributes Stores Unknown Attributes in Parameters", () => {
    var attrs = new ResourceAttributes("service", "1.0")

    attrs.setAttributes({
        custom_field: "custom_value",
        metric_1: "value1",
        tags: ["tag1", "tag2"]
    })

    var impl = toImpl(attrs)
    expect(impl.parameters["custom_field"]).toBe("custom_value")
    expect(impl.parameters["metric_1"]).toBe("value1")
    expect(impl.parameters["tags"]).toBe('["tag1","tag2"]')
})

test("Verify setAttributes Stringifies Complex Types", () => {
    var attrs = new ResourceAttributes("service", "1.0")

    attrs.setAttributes({
        array_field: [1, 2, 3],
        object_field: { key: "value", nested: { deep: "data" } },
        boolean_field: true,
        number_field: 42
    })

    var impl = toImpl(attrs)
    expect(impl.parameters["array_field"]).toBe("[1,2,3]")
    expect(impl.parameters["object_field"]).toBe('{"key":"value","nested":{"deep":"data"}}')
    expect(impl.parameters["boolean_field"]).toBe("true")
    expect(impl.parameters["number_field"]).toBe("42")
})

test("Verify setAttributes Prevents Overwriting Readonly Fields", () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

    var attrs = new ResourceAttributes("service", "1.0")

    attrs.setAttributes({
        clientSdkVersion: "2.0.0",
        schemaVersion: "2.0.0",
        parameters: { fake: "params" }
    })

    var impl = toImpl(attrs)
    expect(impl.clientSdkVersion).toBe("0.0.0")
    expect(impl.schemaVersion).toBe("0.2.0")
    expect(consoleSpy).toHaveBeenCalledTimes(3)

    consoleSpy.mockRestore()
})

test("Verify setAttributes Skips Null and Undefined Values", () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

    var attrs = new ResourceAttributes("service", "1.0")

    attrs.setAttributes({
        null_field: null,
        undefined_field: undefined,
        valid_field: "valid"
    })

    var impl = toImpl(attrs)
    expect(impl.parameters["valid_field"]).toBe("valid")
    expect(impl.parameters["null_field"]).toBeUndefined()
    expect(impl.parameters["undefined_field"]).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledTimes(2)

    consoleSpy.mockRestore()
})

test("Verify setAttributes Validates Service Name and Version Updates", () => {
    var attrs = new ResourceAttributes("service", "1.0")

    expect(() => attrs.setAttributes({ serviceName: "invalid name!" }))
        .toThrow("serviceName not set. invalid name! is invalid regex")

    expect(() => attrs.setAttributes({ serviceVersion: "1.0.0-beta!" }))
        .toThrow("serviceVersion not set. 1.0.0-beta! is invalid regex")
})

test("Verify setAttributes Returns Instance for Method Chaining", () => {
    var attrs = new ResourceAttributes("service", "1.0")

    var result = attrs
        .setAttributes({ environment: "test" })
        .setAttributes({ userId: "user789" })
        .setAttributes({ custom: "value" })

    expect(result).toBe(attrs)
})

test("Verify getAttributes Returns All Attributes with OTEL Naming", () => {
    var attrs = new ResourceAttributes("test-service", "2.0.0")
    var internal_attrs = toImpl(attrs)
    attrs.setAttributes({
        environment: "production",
        userId: "test-user",
        custom_attr: "custom_value"
    })

    var result = internal_attrs.getResourceAttributes()
    var result2 = internal_attrs.getEventAttributes()

    expect(result["service.name"]).toBe("test-service")
    expect(result["service.version"]).toBe("2.0.0")
    expect(result["environment"]).toBe("production")
    expect(result2["user.id"]).toBe("test-user")
    expect(result["client.sdk.version"]).toBe("0.0.0")
    expect(result["schema.version"]).toBe("0.2.0")

    expect(result["environment"]).toBe("production")
    expect(result2["custom_attr"]).toBe("custom_value")
})

test("Verify Multiple Instances Have Unique IDs", () => {
    var attrs1 = new ResourceAttributes("service1", "1.0")
    var attrs2 = new ResourceAttributes("service2", "1.0")
    var attrs3 = new ResourceAttributes("service3", "1.0")

    expect(attrs1.__id).toBe("0")
    expect(attrs2.__id).toBe("1")
    expect(attrs3.__id).toBe("2")

    var length = Object.keys(InternalResourceAttributes.__lookupImpl).length
    expect(length).toBe(3)
})

test("Verify checkValidString Helper Function", () => {
    expect(InternalResourceAttributes.checkValidString("valid-name_1.0")).toBe(true)
    expect(InternalResourceAttributes.checkValidString("a")).toBe(true)
    expect(InternalResourceAttributes.checkValidString("a".repeat(30))).toBe(true)

    expect(InternalResourceAttributes.checkValidString("invalid name")).toBe(false)
    expect(InternalResourceAttributes.checkValidString("invalid!")).toBe(false)
    expect(InternalResourceAttributes.checkValidString("")).toBe(false)
    expect(InternalResourceAttributes.checkValidString("a".repeat(31))).toBe(false)
})

test("Verify isValidEnvironment Helper Function", () => {
    expect(InternalResourceAttributes.isValidEnvironment("")).toBe(true)
    expect(InternalResourceAttributes.isValidEnvironment("test")).toBe(true)
    expect(InternalResourceAttributes.isValidEnvironment("development")).toBe(true)
    expect(InternalResourceAttributes.isValidEnvironment("staging")).toBe(true)
    expect(InternalResourceAttributes.isValidEnvironment("production")).toBe(true)
    expect(InternalResourceAttributes.isValidEnvironment("invalid")).toBe(false)
    expect(InternalResourceAttributes.isValidEnvironment("PRODUCTION")).toBe(false)
})

test("Verify toImpl Returns Correct Internal Implementation", () => {
    var attrs = new ResourceAttributes("service", "1.0")
    var impl = toImpl(attrs)

    expect(impl).toBeInstanceOf(InternalResourceAttributes)
    expect(impl.serviceName).toBe("service")
    expect(impl.serviceVersion).toBe("1.0")
    expect(impl).toBe(InternalResourceAttributes.__lookupImpl[attrs.__id])
})

test("Verify Parameters JSON String Format", () => {
    var attrs = new ResourceAttributes("service", "1.0")

    attrs.setAttributes({
        tags: ["production", "v2"],
        metadata: { region: "us-east-1", zone: "a" },
        count: 100,
        enabled: false
    })

    var impl = toImpl(attrs)

    // First verify the parameters were stored
    expect(impl.parameters["tags"]).toBe('["production","v2"]')
    expect(impl.parameters["metadata"]).toBe('{"region":"us-east-1","zone":"a"}')
    expect(impl.parameters["count"]).toBe("100")
    expect(impl.parameters["enabled"]).toBe("false")

    var result = impl.getEventAttributes()
     // Verify parameters exists
    expect(result["tags"]).toBe('["production","v2"]')
    expect(result["metadata"]).toBe('{"region":"us-east-1","zone":"a"}')
    expect(result["count"]).toBe("100")
    expect(result["enabled"]).toBe("false")

    // Verify we can parse the nested values
    expect(JSON.parse(result["tags"])).toEqual(["production", "v2"])
    expect(JSON.parse(result["metadata"])).toEqual({ region: "us-east-1", zone: "a" })
})
