// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { Configuration, InternalConfiguration, toImpl as toImplCfg } from './config';
import { ResourceAttributes, InternalResourceAttributes, toImpl as toImplAttrs } from './attributes';

import { Resource, resourceFromAttributes } from '@opentelemetry/resources';

export class AnacondaCommon {
    config: InternalConfiguration
    attributes: InternalResourceAttributes
    resources: Resource

    protected constructor(config: Configuration, attributes: ResourceAttributes) {
        this.config = toImplCfg(config)
        this.attributes = toImplAttrs(attributes)

        let resourceObject = this.attributes.getAttributes()
        resourceObject['session.id'] = this.config.getEntropy()
        this.resources = resourceFromAttributes(resourceObject)
    }

    protected makeNewResource(newAttributes: ResourceAttributes): void {
        this.attributes = toImplAttrs(newAttributes)

        let resourceObject = this.attributes.getAttributes()
        resourceObject['session.id'] = this.config.getEntropy()
        this.resources = resourceFromAttributes(resourceObject)
    }

    protected get serviceName(): string {
        return this.attributes.getServiceName()
    }

    protected get serviceVersion(): string {
        return this.attributes.getServiceVersion()
    }

    protected get useConsole(): boolean {
        return this.config.getUseConsole()
    }

    protected get metricsExportIntervalMs(): number {
        return this.config.getMetricsExportIntervalMs()
    }

    protected get skipInternetCheck(): boolean {
        return this.config.getSkipInternetCheck()
    }

    protected readCertFile(certFile: string): string | undefined {
        if (certFile && certFile.length > 0) {
            try {
                return require('fs').readFileSync(certFile, 'utf8')
            } catch (error) {
                this.error(`Failed to read certificate file: ${certFile}: ${error}`)
                return undefined
            }
        }
        return undefined
    }

    protected forEachMetricsEndpoints(callback: (endpoint: URL, authToken?: string, certFile?: string) => void): void {
        this.config.forEachMetricsEndpoints((endpoint, authToken, certFile) => {
            callback(endpoint, authToken, certFile)
        })
    }

    protected forEachTraceEndpoints(callback: (endpoint: URL, authToken?: string, certFile?: string) => void): void {
        this.config.forEachTraceEndpoints((endpoint, authToken, certFile) => {
            callback(endpoint, authToken, certFile)
        })
    }

    protected debug(line: string) {
        if (this.config.getUseDebug()) {
            console.debug(`*** DEBUG: ${line}`)
        }
    }

    protected warn(line: string) {
        console.warn(`*** ERROR: ${line}`)
    }

    protected error(line: string) {
        console.error(`*** WARNING: ${line}`)
    }

    protected isValidName(name: string): boolean {
        const regex = /^[A-Za-z][A-Za-z_0-9]+$/;
        return regex.test(name);
    }
}
