// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import { Configuration, InternalConfiguration, toImpl as toImplCfg } from './config.js';
import { ResourceAttributes, InternalResourceAttributes, toImpl as toImplAttrs } from './attributes.js';

// value import (namespace gives us both ESM & CJS shapes)
import * as resourcesNS from '@opentelemetry/resources';

// ---- v2 export OR v1 fallback to `new Resource(attrs)` ----
const resourceFromAttributes =
  (resourcesNS as any).resourceFromAttributes ??
  ((attrs: Record<string, unknown>) => new (resourcesNS as any).Resource(attrs));

// type import + alias (so you can keep using `Resource` in type positions)
import type { Resource as _Resource } from '@opentelemetry/resources';
import type { AttrMap } from './types.js';
type Resource = _Resource;

export class AnacondaCommon {
    config: InternalConfiguration
    attributes: InternalResourceAttributes
    resources: Resource

    protected constructor(config: Configuration, attributes: ResourceAttributes) {
        this.config = toImplCfg(config)
        this.attributes = toImplAttrs(attributes)

        let resourceObject = this.attributes.getResourceAttributes()
        if (this.config.getEntropy() !== '') {
            resourceObject['session.id'] = this.config.getEntropy()
        }
        this.resources = resourceFromAttributes(resourceObject)
    }

    protected makeNewResource(newAttributes: ResourceAttributes): void {
        this.attributes = toImplAttrs(newAttributes)

        let resourceObject = this.attributes.getResourceAttributes()
        if (this.config.getEntropy() !== '') {
            resourceObject['session.id'] = this.config.getEntropy()
        }
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
                return fs.readFileSync(certFile, 'utf8')
            } catch (error) {
                this.error(`Failed to read certificate file: ${certFile}: ${error}`)
                return undefined
            }
        }
        return undefined
    }

    protected debug(line: string) {
        if (this.config.getUseDebug()) {
            console.debug(`${localTimeString()} > *** ATEL DEBUG: ${line}`)
        }
    }

    protected warn(line: string) {
        console.warn(`${localTimeString()} > *** ATEL ERROR: ${line}`)
    }

    protected error(line: string) {
        console.error(`${localTimeString()} > *** ATEL WARNING: ${line}`)
    }

    protected isValidName(name: string): boolean {
        const regex = /^[A-Za-z][A-Za-z_0-9]+$/;
        return regex.test(name);
    }

    protected transformURL(url: URL): [string, URL] {
        const scheme = url.protocol
        const ep = new URL(url.href)
        ep.protocol = ep.protocol.replace("grpcs:", "https:")
        ep.protocol = ep.protocol.replace("grpc:", "http:")
        return [scheme, ep]
    }

    protected makeHeaders(scheme: string, authToken: string | undefined): Record<string,string> {
        var headers: Record<string,string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        if (scheme.startsWith('http')) {
            headers['Content-Type'] = 'application/x-protobuf'
        }
        return headers
    }

    makeEventAttributes(userAttributes: AttrMap | undefined | null): AttrMap {
        // Get changing attributes from ResourceAttributes...
        const result: AttrMap = this.attributes.getEventAttributes()

        // Make sure there is a 'user.id' value...
        if (!result['user.id']) {
            result['user.id'] = "anonymous"
        }

        // Add user supplied attributes if any...
        if (userAttributes) {
            for (const key in userAttributes) {
                if (userAttributes[key]) {
                    result[key] = userAttributes[key]
                }
            }
        }
        return result
    }
}

export function localTimeString(): string {
    const d = new Date();
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");

    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    const ms = pad(d.getMilliseconds(), 3);

    return `${hh}:${mm}:${ss}.${ms}`;
}
