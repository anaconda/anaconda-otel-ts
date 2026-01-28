// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0


// Types for code readability...
export type EndpointTuple = [URL, string | undefined, string | undefined]

// NOTE: Logging support is TBD right now. The implementation in OTEL is Experimental.

/**
 * Represents the configuration for OpenTelemetry endpoints and options.
 *
 * Allows setting default endpoints, authentication tokens, and certificate files,
 * as well as adding metrics and trace endpoints. Provides options for console output,
 * metric export intervals, and skipping internet connectivity checks.
 *
 * @remarks
 * Environment variables can override default endpoint, authentication token, and certificate file:
 * - `ATEL_DEFAULT_ENDPOINT`
 * - `ATEL_DEFAULT_AUTH_TOKEN`
 * - `ATEL_DEFAULT_TLS_PRIVATE_CA_CERT_FILE`
 *
 * * Additionally, the following environment variables can be used to configure metrics and trace endpoints:
 * - `ATEL_METRICS_ENDPOINT`
 * - `ATEL_METRICS_AUTH_TOKEN`
 * - `ATEL_METRICS_TLS_PRIVATE_CA_CERT_FILE`
 * - `ATEL_TRACE_ENDPOINT`
 * - `ATEL_TRACE_AUTH_TOKEN`
 * - `ATEL_TRACE_TLS_PRIVATE_CA_CERT_FILE`
 * - `ATEL_USE_CONSOLE` (to route ALL OTEL signals to console output, this is not a per signal type flag)
 * - `ATEL_METRICS_EXPORT_INTERVAL_MS` (to set the interval for metrics export, default is 60000ms, minumum is 1000ms)
 * - `ATEL_TRACES_EXPORT_INTERVAL_MS` (to set the interval for metrics export, default is 60000ms, minumum is 1000ms)
* - `ATEL_SKIP_INTERNET_CHECK` (to skip the internet connectivity check, use "true" or "yes" or "1" to skip)
 * - `ATEL_TRACING_SESSION_ENTROPY` (to set the entropy for the tracing session, used to generate unique session IDs)
 * - `ATEL_USE_CUMULATIVE_METRICS` (This will set CUMULATIVE for counter and histogram metrics instead of the default DELTA)
 *
 * @example
 * ```typescript
 * const config = new Configuration();
 * config.setMetricsEndpoint(new URL("https://metrics.example.com"), "token", "/path/to/cert.pem")
 *       .setUseConsoleOutput(true)
 *       .setMetricExportIntervalMs(2000);
 * ```
 *
 * All endpoint network schemes **must** be one of these schemes or that endpoint will log a
 * warning and not function as expected:
 *   - **http:** - Regular uncompressed HTTP JSON payloads unencrypted connection.
 *   - **https:** - Regular uncompressed HTTP JSON payloads over a TLS encrypted connection.
 *   - **grpc:** - GRPC compressed payloads over HTTP unencrypted connection.
 *   - **grrpcs:** - GRPC compressed payloads over HTTP TLS encrypted connection.
 *   - **console:** - JSON payload written to the stdout console.
 *   - **devnull:** - Suppresses all output for the specified signal type.
 *
 * All endpoints beginning with `http:` or `https:` must use the url path "/v1/`signal_type`"" where
 * `signal_types` is one of `metrics` or `traces` for metrics and tracing signals respectively.
 */
export class Configuration {
    private _impl: InternalConfiguration
    private readonly _id: string

    /**
     * Constructs a new instance of the configuration class, initializing internal state and
     * setting default values for endpoint, authentication token, and certificate file.
     *
     * The class prioritizes values in the following order:
     * 1. Environment variables (`ATEL_DEFAULT_ENDPOINT`, `ATEL_DEFAULT_AUTH_TOKEN`, `ATEL_DEFAULT_TLS_PRIVATE_CA_CERT_FILE`). This allows quick changes in behaviors without changing code of application configuration.
     * 2. Explicitly provided arguments to this constructor.
     * 3. Internal default values if both of the first 2 are missing.
     *
     * @param defaultEndpoint - The default endpoint URL to use. If not provided, falls back to environment variable or internal default (grpc://localhost:4317).
     * @param defaultAuthToken - The default authentication token. If not provided, falls back to environment variable or internal default (undefined).
     * @param defaultCertFile - The default certificate file path. If not provided, falls back to environment variable or internal default (undefined).
     */
    public constructor(defaultEndpoint?: URL, defaultAuthToken?: string, defaultCertFile?: string) {
        this._impl = new InternalConfiguration()
        this._id = String(InternalConfiguration.__nextId++)
        InternalConfiguration.__lookupImpl[this._id] = this._impl
        if (defaultEndpoint === undefined) {
            defaultEndpoint = InternalConfiguration.defaultUrl
        }
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_DEFAULT_ENDPOINT)) {
            defaultEndpoint = new URL(process.env.ATEL_DEFAULT_ENDPOINT as string)
        }
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_DEFAULT_AUTH_TOKEN)) {
            defaultAuthToken = process.env.ATEL_DEFAULT_AUTH_TOKEN
        }
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_DEFAULT_TLS_PRIVATE_CA_CERT_FILE)) {
            defaultCertFile = process.env.ATEL_DEFAULT_TLS_PRIVATE_CA_CERT_FILE
        }
        this._impl.defaultEndpoint = [defaultEndpoint, defaultAuthToken, defaultCertFile]
    }

    /**
     * Set a metrics endpoint to the configuration, overriding any previous endpoints.
     *
     * @param endpoint - The URL of the metrics endpoint.
     * @param authToken - Optional authentication token for the endpoint.
     * @param certFile - Optional path to a certificate file for secure connections.
     * @returns The current instance for method chaining.
     */
    public setMetricsEndpoint(endpoint: URL, authToken?: string, certFile?: string): this {
        this._impl.metricsEndpoint = [endpoint, authToken, certFile]
        return this
    }

    /**
     * Set a trace endpoint to the configuration, overriding any previous endpoints.
     *
     * @param endpoint - The URL of the metrics endpoint.
     * @param authToken - Optional authentication token for the endpoint.
     * @param certFile - Optional path to a certificate file for secure connections.
     * @returns The current instance for method chaining.
     */
    public setTraceEndpoint(endpoint: URL, authToken?: string, certFile?: string): this {
        this._impl.traceEndpoint = [endpoint, authToken, certFile]
        return this
    }

    /**
     * Sets whether console output should be used for logging or diagnostics. This
     * value overrides all set endpoints. If required to send only one signal to
     * console and not the other one(s), use endpoint network scheme "console:" for
     * the specific signal stream(s) to be sent to the console.
     *
     * @param value - If `true`, enables console output for all signal types; if
     *  `false`, endpoints are used. Default for the Configuration is `false`
     * @returns The current instance for method chaining.
     */
    public setUseConsoleOutput(value: boolean): this {
        this._impl.useConsole = value
        return this
    }

    /**
     * Sets the interval, in milliseconds, at which metrics are exported.
     *
     * @param value - The export interval in milliseconds. Must be at least 1000ms.
     * @returns The current instance for method chaining.
     * @throws {Error} If the provided value is less than 1000ms.
     */
    public setMetricExportIntervalMs(value: number): this {
        if (value < 1000) {
            throw new Error("*** Metric export interval must be at least 100ms")
        }
        this._impl.metricsExportIntervalMs = value
        return this
    }

    /**
     * Sets the interval, in milliseconds, at which traces are exported.
     *
     * @param value - The export interval in milliseconds. Must be at least 1000ms.
     * @returns The current instance for method chaining.
     * @throws {Error} If the provided value is less than 1000ms.
     */
    public setTraceExportIntervalMs(value: number): this {
        if (value < 1000) {
            throw new Error("*** Trace export interval must be at least 100ms")
        }
        this._impl.tracesExportIntervalMs = value
        return this
    }

    /**
     * Sets whether to skip the internet connectivity check.
     *
     * @param value - If `true`, the internet check will be skipped; otherwise, it will be performed.
     * @returns The current instance for method chaining.
     */
    public setSkipInternetCheck(value: boolean): this {
        this._impl.skipInternetCheck = value
        return this
    }

    /**
     * Sets the entropy value for the tracing session.
     *
     * The entropy is typically used to introduce uniqueness
     * into the tracing session, which can help with sampling or correlation.
     *
     * @param entropy - A string representing the entropy value to be used for the tracing session.
     * @returns The current instance for method chaining.
     */
    public setTracingSessionEntropy(entropy: string): this {
        this._impl.entropy = entropy
        return this
    }

    /**
     * Enables or disables debug mode.
     *
     * @param newState - Whether to enable debug mode (default: `false`).
     * @returns The current instance for method chaining.
     */
    public setDebugState(newState: boolean) {
        this._impl.useDebug = newState
        return this
    }

    /**
     * Enables or disables **cumulative** for counter metrics and histograms temporality.
     *
     * When enabled, metric instruments are exported using *CUMULATIVE* temporality
     * (an ever-increasing total) instead of the default *DELTA* temporality
     * (per-interval change).
     *
     * @param enabled - Set `true` to export metrics as cumulative; set `false` to
     * use delta temporality.
     * @returns The current instance for method chaining.
     *
     * @remarks
     * - This flag applies only to metric-like instruments; histogram temporality
     *   is controlled separately via {@link setCumulativeMetricHistograms}.
     * - Environment override: if `ATEL_USE_CUMULATIVE_METRICS` is defined
     *   (e.g., "true"/"yes"/"1"), it may take precedence over this programmatic setting.
     * - Temporality affects how backends aggregate and query time series; choose
     *   cumulative when your backend expects monotonic totals.
     * - This method performs no I/O and can be called during configuration prior to
     *   starting exporters.
     * - __IMPORTANT__: Setting DELTA (the default) may not actually work in the
     *   underlying OTel library. It is recommended that cumulative be converted to
     *   deltas in the collector if delta is desired for Counters and Histograms.
     */
    public setUseCumulativeMetrics(enabled: boolean): this {
        this._impl.cumulativeMetrics = enabled
        return this
    }

    // This returns the unique identifier for this configuration instance. This is not intended for public use.
    /**
     * @hidden
     */
    public get __id(): string {
        return this._id
    }
}

// Internal configuration storage and retrieval
export class InternalConfiguration {
    // Manage instances of Configuration globally (technically there should be only one instance but need to be safe)
    // The alternative would be to make the Configuration a singleton, not recommended for Configuration.
    public static __nextId: number = 0
    public static __lookupImpl: { [key: string]:InternalConfiguration} = {}

    public static checkIfEnvUndefined(value: any): boolean {
        return value === undefined || value === null || value === '' || value === 'undefined' || value === 'null'
    }


    public static readonly consoleUrl: URL = new URL("console:")
    public static readonly defaultUrl: URL = new URL("grpc://localhost:4317/")

    public defaultEndpoint: EndpointTuple = [InternalConfiguration.defaultUrl, undefined, undefined]
    public metricsEndpoint: EndpointTuple | undefined  = undefined
    public traceEndpoint: EndpointTuple | undefined = undefined
    public useConsole: boolean = false
    public metricsExportIntervalMs: number = 60000 // Default to 60 seconds
    public tracesExportIntervalMs: number = 60000 // Default to 60 seconds
    public skipInternetCheck: boolean = false
    public entropy: string = ""
    public useDebug: boolean = false
    public cumulativeMetrics: boolean = false // DELTA by default; user set explictly

    public constructor() {}

    public getDefaultEndpoint(): URL {
        if (this.getUseConsole()) {
            return InternalConfiguration.consoleUrl
        }
        return this.getDefaultEndpointTuple()[0]
    }

    public getUseConsole(): boolean {
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_USE_CONSOLE)) {
            const useStr = (process.env.ATEL_USE_CONSOLE as string).toLowerCase()
            if (useStr === "true" || useStr === "yes" || useStr === "1") {
                return true
            }
            return false
        }
        return this.useConsole
    }

    public getMetricsEndpointTuple(): EndpointTuple {
        if (this.getUseConsole()) {
            return InternalConfiguration.consoleTuple
        } else if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_METRICS_ENDPOINT)) {
            const def: EndpointTuple = this.getDefaultEndpointTuple()
            const endpoint: EndpointTuple = [def[0], def[1], def[2]]
            endpoint[0] = new URL(process.env.ATEL_METRICS_ENDPOINT as string)
            if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_METRICS_AUTH_TOKEN)) {
                endpoint[1] = process.env.ATEL_METRICS_AUTH_TOKEN
            }
            if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_METRICS_TLS_PRIVATE_CA_CERT_FILE)) {
                endpoint[2] = process.env.ATEL_METRICS_TLS_PRIVATE_CA_CERT_FILE
            }
            return endpoint
        } else if (this.metricsEndpoint === undefined) {
            return this.getDefaultEndpointTuple()
        } else {
            return this.metricsEndpoint!
        }
    }

    public getTraceEndpointTuple(): EndpointTuple {
        if (this.getUseConsole()) {
            return InternalConfiguration.consoleTuple
        } else if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_TRACE_ENDPOINT)) {
            const def: EndpointTuple = this.getDefaultEndpointTuple()
            const endpoint: EndpointTuple = [def[0], def[1], def[2]]
            endpoint[0] = new URL(process.env.ATEL_TRACE_ENDPOINT as string)
            if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_TRACE_AUTH_TOKEN)) {
                endpoint[1] = process.env.ATEL_TRACE_AUTH_TOKEN
            }
            if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_TRACE_TLS_PRIVATE_CA_CERT_FILE)) {
                endpoint[2] = process.env.ATEL_TRACE_TLS_PRIVATE_CA_CERT_FILE
            }
            return endpoint
        } else if (this.traceEndpoint === undefined) {
            return this.getDefaultEndpointTuple()
        } else {
            return this.traceEndpoint
        }
    }

    public getMetricsExportIntervalMs(): number {
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_METRICS_EXPORT_INTERVAL_MS)) {
            const str = process.env.ATEL_METRICS_EXPORT_INTERVAL_MS as string
            const value = parseInt(str, 10)
            if (isNaN(value) || value < 1000) {
                return this.metricsExportIntervalMs // Default internal storage milliseconds if invalid.
            }
            return value
        }
        return this.metricsExportIntervalMs
    }

    public getTracesExportIntervalMs(): number {
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_TRACES_EXPORT_INTERVAL_MS)) {
            const str = process.env.ATEL_TRACES_EXPORT_INTERVAL_MS as string
            const value = parseInt(str, 10)
            if (isNaN(value) || value < 1000) {
                return this.tracesExportIntervalMs // Default internal storage milliseconds if invalid.
            }
            return value
        }
        return this.tracesExportIntervalMs
    }

    public getSkipInternetCheck(): boolean {
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_SKIP_INTERNET_CHECK)) {
            const str = (process.env.ATEL_SKIP_INTERNET_CHECK as string).toLowerCase()
            return str === "true" || str === "yes" || str === "1"
        }
        return this.skipInternetCheck
    }

    // "Private" Implementation...
    private static readonly consoleTuple: EndpointTuple = [InternalConfiguration.consoleUrl, undefined, undefined]

    public getDefaultEndpointTuple(): EndpointTuple {
        if (this.getUseConsole()) {
            return InternalConfiguration.consoleTuple
        }
        return this.defaultEndpoint
    }

    public getEntropy(): string {
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_TRACING_SESSION_ENTROPY)) {
            return process.env.ATEL_TRACING_SESSION_ENTROPY as string
        }
        return this.entropy
    }

    public getUseDebug(): boolean {
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_USE_DEBUG)) {
            const str = (process.env.ATEL_USE_DEBUG as string).toLowerCase()
            return str === "true" || str === "yes" || str === "1"
        }
        return this.useDebug
    }

    public getUseCumulativeMetrics(): boolean {
        if (!InternalConfiguration.checkIfEnvUndefined(process.env.ATEL_USE_CUMULATIVE_METRICS)) {
            const str = process.env.ATEL_USE_CUMULATIVE_METRICS as string
            if (str === "true" || str === "yes" || str === "1") {
                return true
            }
            return false
        }
        return this.cumulativeMetrics
    }
}

// Used inside the package to get the private impl from the public class.
export function toImpl(configuration: Configuration): InternalConfiguration {
    const id = configuration.__id
    const impl: InternalConfiguration = InternalConfiguration.__lookupImpl[id]
    return impl
}
