// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

// attributes.ts

import * as os from 'os';
import { sdkVersion, schemaVersion } from './__version__.js';

// Type definitions for readability
type EnvironmentType = "" | "test" | "development" | "staging" | "production";
type AttributeDict = Record<string, string>;

/**
 * Represents the configuration for resource attributes used in telemetry.
 *
 * Manages common attributes initialized at startup and dynamic attributes added thereafter.
 * Provides validation, default value population, and protection for readonly fields.
 *
 * @remarks
 * The class enforces specific validation rules:
 * - `serviceName` and `serviceVersion` must match the regex pattern `^[a-zA-Z0-9._-]{1,30}$`
 * - `environment` must be one of: "", "test", "development", "staging", "production"
 * - Readonly fields (`clientSdkVersion`, `schemaVersion`) cannot be modified after initialization
 *
 * @example
 * ```typescript
 * const attributes = new ResourceAttributes("my-service", "1.0.0");
 * attributes.setAttributes({
 *     environment: "production",
 *     userId: "user123",
 *     custom_metric: "value",
 *     tags: ["tag1", "tag2", "tag3"],         // Will be stored as '["tag1","tag2","tag3"]'
 *     metadata: { region: "us-west" },        // Will be stored as '{"region":"us-west"}'
 *     active: true,                           // Will be stored as "true"
 *     request_count: 42                       // Will be stored as "42"
 * });
 * ```
 */
export class ResourceAttributes {
    private _impl: InternalResourceAttributes;
    private readonly _id: string;

    /**
     * Constructs a new instance of ResourceAttributes with required service information.
     *
     * @param serviceName - Name of the client service. Required. Must match regex `^[a-zA-Z0-9._-]{1,30}$`
     * @param serviceVersion - Version of the client service. Required. Must match regex `^[a-zA-Z0-9._-]{1,30}$`
     * @param osType - Operating system type of client machine. Defaults to system value.
     * @param osVersion - Operating system version of client machine. Defaults to system value.
     * @param nodeVersion - Node.js version of the client. Defaults to process.version.
     * @param hostname - Hostname of client machine. Defaults to system hostname.
     * @param platform - Infrastructure on which the software is provided.
     * @param environment - Environment the software is running in.
     * @param userId - String denoting a user of a client application.
     * @throws {Error} If serviceName or serviceVersion don't match the required pattern.
     */
    public constructor(
        serviceName: string,
        serviceVersion: string,
        osType: string = "",
        osVersion: string = "",
        nodeVersion: string = "",
        hostname: string = "",
        platform: string = "",
        environment: string = "",
        userId: string = ""
    ) {
        this._impl = new InternalResourceAttributes();
        this._id = String(InternalResourceAttributes.__nextId++);
        InternalResourceAttributes.__lookupImpl[this._id] = this._impl;

        // Validate and set serviceName and serviceVersion
        if (!InternalResourceAttributes.checkValidString(serviceName)) {
            throw new Error(`serviceName not set. ${serviceName} is invalid regex for this key: \`^[a-zA-Z0-9._-]{1,30}$\`. This is a required parameter`);
        }
        if (!InternalResourceAttributes.checkValidString(serviceVersion)) {
            throw new Error(`serviceVersion not set. ${serviceVersion} is invalid regex for this key: \`^[a-zA-Z0-9._-]{1,30}$\`. This is a required parameter`);
        }

        // Set required attributes
        this._impl.serviceName = serviceName;
        this._impl.serviceVersion = serviceVersion;

        // Set other attributes with defaults
        this._impl.osType = osType || os.type();
        this._impl.osVersion = osVersion || os.release();
        this._impl.nodeVersion = nodeVersion || process.version;
        this._impl.hostname = hostname || os.hostname();
        this._impl.platform = platform;
        this._impl.userId = userId;

        // Validate and set environment
        const normalizedEnv = environment.trim().toLowerCase() as EnvironmentType;
        if (InternalResourceAttributes.isValidEnvironment(normalizedEnv)) {
            this._impl.environment = normalizedEnv;
        } else {
            console.warn(`Invalid environment value \`${environment}\`, setting to empty string. Environment must be in ["", "test", "development", "staging", "production"]`);
            this._impl.environment = "";
        }

        // Set readonly fields
        this._impl.clientSdkVersion = sdkVersion;
        this._impl.schemaVersion = schemaVersion;
    }

    /**
     * Sets attributes according to key-value pairs passed to this function.
     * Will overwrite existing attributes, unless they are readonly.
     * All values are converted to strings internally.
     *
     * @param attributes - Object containing attribute key-value pairs. Common attributes include:
     * - `serviceName`: Name of client service
     * - `serviceVersion`: Version of client service
     * - `osType`: Operating system type of client machine
     * - `osVersion`: Operating system version of client machine
     * - `nodeVersion`: Node.js version of the client
     * - `hostname`: Hostname of client machine
     * - `platform`: Infrastructure on which the software runs
     * - `environment`: Environment of the software ("", "test", "development", "staging", "production")
     * - `userId`: String denoting a user of a client application
     *
     * Any other keys will be stored in the parameters collection.
     * Complex values (objects, arrays) will be JSON stringified.
     * @returns The current instance for method chaining.
     */
    public setAttributes(attributes: { [key: string]: any }): this {
        for (const [key, value] of Object.entries(attributes)) {
            if (value === null || value === undefined || key === null || key === undefined) {
                console.warn(`Either an attribute or key is None which is not allowed. Attribute: \`${key}\`. Value: \`${value}\``);
                continue;
            }

            // Check if it's a readonly field
            if (InternalResourceAttributes.readonlyFields.includes(key)) {
                console.warn(`Attempted overwrite of readonly common attribute ${key}`);
                continue;
            }

            // Convert value to string
            let stringValue: string;
            if (typeof value === 'object') {
                // For objects and arrays, use JSON.stringify
                stringValue = JSON.stringify(value);
            } else {
                // For primitives, use String()
                stringValue = String(value);
            }

            // Check if it's a known attribute
            let knownAttributes: Set<string> = this._impl.getKnownAttributes()
            if (knownAttributes.has(key)) {
                // Special validation for serviceName and serviceVersion
                if ((key === 'serviceName' || key === 'serviceVersion') &&
                    !InternalResourceAttributes.checkValidString(stringValue)) {
                    throw new Error(`${key} not set. ${value} is invalid regex for this key: \`^[a-zA-Z0-9._-]{1,30}$\`. This is a required parameter`);
                }

                // Special handling for environment
                if (key === 'environment') {
                    const normalizedEnv = stringValue.trim().toLowerCase() as EnvironmentType;
                    if (InternalResourceAttributes.isValidEnvironment(normalizedEnv)) {
                        this._impl.environment = normalizedEnv;
                    } else {
                        console.warn(`Invalid environment value \`${value}\`, setting to empty string. Environment must be in ["", "test", "development", "staging", "production"]`);
                        this._impl.environment = "";
                    }
                } else {
                    // Set the attribute
                    (this._impl as any)[key] = stringValue;
                }
            } else {
                // Store in parameters
                this._impl.parameters[String(key)] = stringValue;
            }
        }

        return this;
    }

    // This returns the unique identifier for this instance. This is not intended for public use.
    /**
     * @hidden
     */
    public get __id(): string {
        return this._id;
    }
}

// Internal implementation class
export class InternalResourceAttributes {
    // Instance management
    public static __nextId: number = 0;
    public static __lookupImpl: { [key: string]: InternalResourceAttributes } = {};

    // Known attribute names (excluding readonly and parameters)
    private static readonly _knownAttributes: Set<string> = new Set([
        'serviceName', 'serviceVersion', 'osType', 'osVersion',
        'nodeVersion', 'hostname', 'platform', 'environment', 'userId'
    ]);

    // Readonly fields
    public static readonly readonlyFields: string[] = ['clientSdkVersion', 'schemaVersion', 'parameters'];

    // Valid environments
    private static readonly validEnvironments: Set<EnvironmentType> = new Set<EnvironmentType>(["", "test", "development", "staging", "production"]);

    // OpenTelemetry attribute name mappings
    private static readonly otelNameMap: Record<string, string> = {
        serviceName: 'service.name',
        serviceVersion: 'service.version',
        osType: 'os.type',
        osVersion: 'os.version',
        nodeVersion: 'node.version',
        hostname: 'hostname',
        platform: 'platform',
        environment: 'environment',
        userId: 'user.id',
        clientSdkVersion: 'client.sdk.version',
        schemaVersion: 'schema.version'
    };

    // Attributes
    public serviceName: string = "";
    public serviceVersion: string = "";
    public osType: string = "";
    public osVersion: string = "";
    public nodeVersion: string = "";
    public hostname: string = "";
    public platform: string = "";
    public environment: EnvironmentType = "";
    public userId: string = "";
    public clientSdkVersion: string = "";
    public schemaVersion: string = "";
    public parameters: AttributeDict = {};

    public constructor() {}

    public static checkValidString(value: string): boolean {
        const regex = /^[a-zA-Z0-9._-]{1,30}$/;
        return regex.test(value);
    }

    public static isValidEnvironment(value: string): value is EnvironmentType {
        return InternalResourceAttributes.validEnvironments.has(value as EnvironmentType);
    }

    public getServiceName(): string {
        return this.serviceName
    }

    public getServiceVersion(): string {
        return this.serviceVersion
    }

    public getEventAttributes(): AttributeDict {
        const result: AttributeDict = {};

        // Add known changing attributes with OTEL names
        for (const [key, otelName] of Object.entries(InternalResourceAttributes.otelNameMap)) {
            if (key !== 'userId') { continue }
            result[otelName] = (this as any)[key];
        }

        return result
    }

    public getResourceAttributes(): AttributeDict {
        const result: AttributeDict = {};

        // Add known attributes with OTEL names
        for (const [key, otelName] of Object.entries(InternalResourceAttributes.otelNameMap)) {
            if (key === 'userId') { continue }
            result[otelName] = (this as any)[key];
        }

        // Add parameters
        result['parameters'] = JSON.stringify(this.parameters)

        return result;
    }

    public getKnownAttributes(): Set<string> {
        return InternalResourceAttributes._knownAttributes
    }
}

// Used inside the package to get the private impl from the public class.
export function toImpl(attributes: ResourceAttributes): InternalResourceAttributes {
    const id = attributes.__id;
    return InternalResourceAttributes.__lookupImpl[id];
}