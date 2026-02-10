// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import { Configuration, InternalConfiguration, toImpl as toImplCfg } from './config.js';
import { ResourceAttributes, InternalResourceAttributes, toImpl as toImplAttrs } from './attributes.js';
import type { AttrMap } from './types.js';

// value import (namespace gives us both ESM & CJS shapes)
import * as resourcesNS from '@opentelemetry/resources';

// ---- v2 export OR v1 fallback to `new Resource(attrs)` ----
const resourceFromAttributes =
  (resourcesNS as any).resourceFromAttributes ??
  ((attrs: Record<string, unknown>) => new (resourcesNS as any).Resource(attrs));

// type import + alias (so you can keep using `Resource` in type positions)
import type { Resource as _Resource } from '@opentelemetry/resources';
type Resource = _Resource;

// type import for typing only
import type { Resource as ResourceType } from '@opentelemetry/resources';

/**
 * Build a Resource with SDK defaults + user attributes.
 * Synchronous, ctor-safe, no detectors.
 */
export function buildResourceWithDefaults(
  attrs: Record<string, unknown> = {}
): ResourceType {
  // Get SDK default resource
  let base: any;
  if (typeof (resourcesNS as any).defaultResource === 'function') {
    // v2.x function API
    base = (resourcesNS as any).defaultResource();
  } else {
    throw new Error('Unsupported @opentelemetry/resources runtime');
  }

  // Build resource from attributes
  const custom =
    typeof (resourcesNS as any).resourceFromAttributes === 'function'
      ? (resourcesNS as any).resourceFromAttributes(attrs)
      : new (resourcesNS as any).Resource(attrs);

  // Merge: defaults <- custom (custom wins)
    return base.merge(custom) as ResourceType;
}


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
        } else {
            resourceObject['session.id'] = crypto.randomUUID();
        }
        this.resources = buildResourceWithDefaults(resourceObject)
    }

    protected makeNewResource(newAttributes: ResourceAttributes): void {
        this.attributes = toImplAttrs(newAttributes)

        let resourceObject = this.attributes.getResourceAttributes()
        if (this.config.getEntropy() !== '') {
            resourceObject['session.id'] = this.config.getEntropy()
        }
        this.resources = buildResourceWithDefaults(resourceObject)
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

    protected get loggingExportIntervalMs(): number {
        return this.config.getLoggingExportIntervalMs()
    }

    protected get skipInternetCheck(): boolean {
        return this.config.getSkipInternetCheck()
    }

    protected readCertFile(certFile: string): string | undefined {
        if (certFile && certFile.length > 0) {
            try {
                return fs.readFileSync(certFile, 'utf8')
            } catch (error) {
                this._error(`Failed to read certificate file: ${certFile}: ${error}`)
                return undefined
            }
        }
        return undefined
    }

    protected _debug(line: string) {
        if (this.config.getUseDebug()) {
            console.debug(`${localTimeString()} > *** ATEL DEBUG: ${line}`)
        }
    }

    protected _warn(line: string) {
        console.warn(`${localTimeString()} > *** ATEL ERROR: ${line}`)
    }

    protected _error(line: string) {
        console.error(`${localTimeString()} > *** ATEL WARNING: ${line}`)
    }

    protected isValidName(name: string): boolean {
        const regex = /^[A-Za-z][A-Za-z0-9]+$/;
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

    errorMessage(err: any): string {
        if (err instanceof Error) {
            return err.message
        } else {
            return String(err)
        }
    }

    makeEventAttributes(userAttributes: AttrMap | undefined | null): AttrMap {
        // Get changing attributes from ResourceAttributes...
        const result: AttrMap = this.attributes.getEventAttributes()

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

    protected isValidOtelUrl(urlStr: string): boolean {
        return urlStr === "console:" || urlStr === "devnull:" ||
               this.isValidOtelHttpUrl(urlStr) || this.isValidOtelGrpcUrl(urlStr)
    }

    private isValidOtelHttpUrl(urlStr: string): boolean {
        let u: URL;
        try {
            u = new URL(urlStr);
        } catch {
            return false;
        }

        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        if (!this.isValidHost(u.hostname)) return false;
        if (u.port && !this.isValidPort(u.port)) return false;

        // Required exact path: /v1/{type} (no trailing "/")
        const m = /^\/v1\/(metrics|logs|traces)$/.exec(u.pathname);
        if (!m) return false;

        // No query/fragment
        if (u.search !== "" || u.hash !== "") return false;

        return true;
    }

    /**
     * 2) Validate an OTLP/gRPC URL:
     * - scheme: grpc | grpcs
     * - host: ipv4 | domain | localhost
     * - optional port
     * - MUST NOT have a path (i.e. "/" only), NO query/fragment
     */
    private isValidOtelGrpcUrl(urlStr: string): boolean {
        let u: URL;
        try {
            u = new URL(urlStr);
        } catch {
            return false;
        }

        if (u.protocol !== "grpc:" && u.protocol !== "grpcs:") return false;
        if (!this.isValidHost(u.hostname)) return false;
        if (u.port && !this.isValidPort(u.port)) return false;

        // No path (URL parser represents "no path" as "/")
        if (u.pathname !== "/") return false;

        // No query/fragment
        if (u.search !== "" || u.hash !== "") return false;

        return true;
    }

    /** Host can be "localhost", a valid IPv4, or a valid domain name. */
    private isValidHost(hostname: string): boolean {
        if (hostname === "localhost") return true;
        if (this.isValidIpv4(hostname)) return true;
        return this.isValidDomain(hostname);
    }

    private isValidPort(portStr: string): boolean {
        // URL.port is always digits or empty
        const port = Number(portStr);
        return Number.isInteger(port) && port >= 1 && port <= 65535;
    }

    private isValidIpv4(s: string): boolean {
        // Strict IPv4: 0-255.0-255.0-255.0-255
        const parts = s.split(".");
        if (parts.length !== 4) return false;
        for (const p of parts) {
            if (!/^\d{1,3}$/.test(p)) return false;
            const n = Number(p);
            if (!Number.isInteger(n) || n < 0 || n > 255) return false;
            // Optional: disallow leading zeros like "01" (commonly preferred)
            if (p.length > 1 && p.startsWith("0")) return false;
        }
        return true;
    }

    private isValidDomain(host: string): boolean {
        // Conservative domain validation:
        // - labels: [a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?
        // - at least one dot
        // - TLD 2-63 letters
        // - total length <= 253
        const h = host.toLowerCase();
        if (h.length === 0 || h.length > 253) return false;
        if (!h.includes(".")) return false;

        const labels = h.split(".");
        if (labels.some(l => l.length === 0)) return false;

        const labelRe = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
        for (const label of labels) {
            if (!labelRe.test(label)) return false;
        }

        const tld = labels[labels.length - 1];
        if (!/^[a-z]{2,63}$/.test(tld)) return false;

        return true;
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
