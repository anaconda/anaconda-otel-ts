import { Agent } from "undici";

// Constants
const DEFAULT_HTTP_PORT = 80;
const DEFAULT_HTTPS_PORT = 443;
const DEFAULT_SCOPE = "openid";
const MAX_PROXY_RESPONSE_BUFFER_SIZE = 8192; // 8KB
const PROXY_CONNECT_TIMEOUT_MS = 30000; // 30 seconds
const PROXY_RESPONSE_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Represents a token set returned by the OIDC/OAuth2 provider.
 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiration date of the access token */
  accessTokenExpiresAt: Date;
  /** Absolute expiration date of the refresh token (undefined if not provided by the server) */
  refreshTokenExpiresAt: Date | undefined;
  /** Raw token type (e.g. "Bearer") */
  tokenType: string;
  /** Space-separated list of granted scopes (undefined if not returned by the server) */
  scope: string | undefined;
}

/**
 * Optional HTTP/HTTPS proxy configuration.
 */
export interface ProxyConfig {
  /** Proxy host, e.g. "proxy.corp.example.com" */
  host: string;
  port: number;
  /** Required when the proxy demands authentication */
  auth?: {
    username: string;
    password: string;
  };
}

/**
 * Configuration required to initialise the OidcAuthManager.
 */
export interface OidcAuthConfig {
  /** Full URL of the token endpoint, e.g. https://auth.example.com/realms/myrealm/protocol/openid-connect/token */
  tokenEndpoint: string;
  clientId: string;
  /** Required for confidential clients; omit for public clients */
  clientSecret?: string;
  /** Space-separated list of scopes to request (default: "openid") */
  scope?: string;
  /** Route token endpoint requests through an HTTP proxy */
  proxy?: ProxyConfig;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Enhanced ProxyTunnel class with proper timeout handling, resource cleanup,
 * and buffer size limits for secure proxy connections.
 */
class ProxyTunnel {
  /**
   * Opens a CONNECT tunnel through an HTTP proxy and returns a raw TCP socket
   * that speaks directly to the target host. Works for both HTTP and HTTPS
   * token endpoints.
   *
   * Pure Node.js net/tls — no third-party libraries.
   */
  static async connect(
    proxy: ProxyConfig,
    targetHost: string,
    targetPort: number,
    useTls: boolean
  ): Promise<import("net").Socket | import("tls").TLSSocket> {
    const net = await import("net");
    const tls = await import("tls");

    let proxySocket: import("net").Socket | undefined;

    try {
      // 1. Open a plain TCP connection to the proxy with timeout.
      proxySocket = await ProxyTunnel.connectToProxy(net, proxy);

      // 2. Send a CONNECT request to the proxy and wait for response.
      await ProxyTunnel.sendConnectRequest(proxySocket, proxy, targetHost, targetPort);

      if (!useTls) return proxySocket;

      // 3. Upgrade the tunnel to TLS for HTTPS targets.
      return await ProxyTunnel.upgradToTls(tls, proxySocket, targetHost);
    } catch (error) {
      // Clean up resources on error
      if (proxySocket && !proxySocket.destroyed) {
        proxySocket.destroy();
      }
      throw error;
    }
  }

  private static async connectToProxy(
    net: typeof import("net"),
    proxy: ProxyConfig
  ): Promise<import("net").Socket> {
    return new Promise<import("net").Socket>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new AuthError(`Proxy connection timeout after ${PROXY_CONNECT_TIMEOUT_MS}ms`));
      }, PROXY_CONNECT_TIMEOUT_MS);

      const socket = net.createConnection(
        { host: proxy.host, port: proxy.port },
        () => {
          clearTimeout(timeout);
          resolve(socket);
        }
      );

      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(new AuthError(`Failed to connect to proxy: ${error.message}`));
      });

      socket.once("close", () => {
        clearTimeout(timeout);
        reject(new AuthError("Proxy connection closed unexpectedly"));
      });
    });
  }

  private static async sendConnectRequest(
    proxySocket: import("net").Socket,
    proxy: ProxyConfig,
    targetHost: string,
    targetPort: number
  ): Promise<void> {
    const authHeader = proxy.auth
      ? `Proxy-Authorization: Basic ${Buffer.from(
          `${proxy.auth.username}:${proxy.auth.password}`
        ).toString("base64")}\r\n`
      : "";

    return new Promise<void>((resolve, reject) => {
      let responseTimeout: NodeJS.Timeout;
      let buffer = Buffer.alloc(0);
      let headersParsed = false;

      const cleanup = () => {
        clearTimeout(responseTimeout);
        proxySocket.off("data", onData);
        proxySocket.off("error", onError);
      };

      const onData = (chunk: Buffer) => {
        // Prevent buffer overflow attacks
        if (buffer.length + chunk.length > MAX_PROXY_RESPONSE_BUFFER_SIZE) {
          cleanup();
          reject(new AuthError("Proxy response too large"));
          return;
        }

        buffer = Buffer.concat([buffer, chunk]);
        const response = buffer.toString();

        // The proxy response headers end with \r\n\r\n
        if (!headersParsed && response.includes("\r\n\r\n")) {
          headersParsed = true;
          cleanup();

          const lines = response.split("\r\n");
          const statusLine = lines[0];
          const statusMatch = statusLine.match(/HTTP\/1\.[01]\s+(\d{3})/);

          if (!statusMatch) {
            reject(new AuthError("Invalid HTTP response from proxy"));
            return;
          }

          const statusCode = parseInt(statusMatch[1], 10);
          if (statusCode === 200) {
            resolve();
          } else {
            reject(new AuthError(`Proxy CONNECT failed: ${statusLine}`, statusCode));
          }
        }
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new AuthError(`Proxy connection error: ${error.message}`));
      };

      responseTimeout = setTimeout(() => {
        cleanup();
        reject(new AuthError(`Proxy response timeout after ${PROXY_RESPONSE_TIMEOUT_MS}ms`));
      }, PROXY_RESPONSE_TIMEOUT_MS);

      proxySocket.on("data", onData);
      proxySocket.once("error", onError);

      // Send the CONNECT request
      const connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${authHeader}\r\n`;

      if (!proxySocket.write(connectRequest)) {
        cleanup();
        reject(new AuthError("Failed to send CONNECT request to proxy"));
      }
    });
  }

  private static async upgradToTls(
    tls: typeof import("tls"),
    proxySocket: import("net").Socket,
    targetHost: string
  ): Promise<import("tls").TLSSocket> {
    return new Promise<import("tls").TLSSocket>((resolve, reject) => {
      const timeout = setTimeout(() => {
        tlsSocket.destroy();
        reject(new AuthError(`TLS upgrade timeout after ${PROXY_CONNECT_TIMEOUT_MS}ms`));
      }, PROXY_CONNECT_TIMEOUT_MS);

      const tlsSocket = tls.connect(
        {
          socket: proxySocket,
          servername: targetHost,
          // Ensure proper certificate validation
          rejectUnauthorized: true
        },
        () => {
          clearTimeout(timeout);
          resolve(tlsSocket);
        }
      );

      tlsSocket.once("error", (error) => {
        clearTimeout(timeout);
        reject(new AuthError(`TLS connection failed: ${error.message}`));
      });
    });
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly serverError?: string,
    public readonly serverErrorDescription?: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;           // seconds until access token expires
  refresh_expires_in?: number;  // seconds until refresh token expires (Keycloak et al.)
  scope?: string;
}

/**
 * Validates if an object matches the TokenResponse interface
 */
function isValidTokenResponse(obj: unknown): obj is TokenResponse {
  if (typeof obj !== 'object' || obj === null) return false;

  const response = obj as Record<string, unknown>;

  return (
    typeof response.access_token === 'string' &&
    typeof response.refresh_token === 'string' &&
    typeof response.token_type === 'string' &&
    typeof response.expires_in === 'number' &&
    response.expires_in > 0 &&
    (response.refresh_expires_in === undefined ||
     (typeof response.refresh_expires_in === 'number' && response.refresh_expires_in > 0)) &&
    (response.scope === undefined || typeof response.scope === 'string')
  );
}

/**
 * Validates configuration parameters
 */
function validateConfig(config: OidcAuthConfig): void {
  if (!config.tokenEndpoint?.trim()) {
    throw new Error('Token endpoint URL is required');
  }

  try {
    const url = new URL(config.tokenEndpoint);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Token endpoint must use HTTP or HTTPS protocol');
    }
  } catch (error) {
    throw new Error(`Invalid token endpoint URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!config.clientId?.trim()) {
    throw new Error('Client ID is required and cannot be empty');
  }

  if (config.clientSecret !== undefined && !config.clientSecret.trim()) {
    throw new Error('Client secret cannot be empty when provided');
  }

  if (config.scope !== undefined && !config.scope.trim()) {
    throw new Error('Scope cannot be empty when provided');
  }

  if (config.proxy) {
    if (!config.proxy.host?.trim()) {
      throw new Error('Proxy host is required when proxy is configured');
    }
    if (!Number.isInteger(config.proxy.port) || config.proxy.port < 1 || config.proxy.port > 65535) {
      throw new Error('Proxy port must be a valid integer between 1 and 65535');
    }
    if (config.proxy.auth) {
      if (!config.proxy.auth.username?.trim() || !config.proxy.auth.password?.trim()) {
        throw new Error('Proxy auth username and password are both required when proxy auth is configured');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class OidcAuthManager {
  private readonly tokenEndpoint: string;
  private readonly clientId: string;
  private readonly clientSecret: string | undefined;
  private readonly scope: string;
  private readonly proxy: ProxyConfig | undefined;

  constructor(config: OidcAuthConfig) {
    // Validate configuration before storing
    validateConfig(config);

    this.tokenEndpoint = config.tokenEndpoint;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.scope = config.scope ?? DEFAULT_SCOPE;
    this.proxy = config.proxy;
  }

  /**
   * Authenticates with the OIDC/OAuth2 provider using the Resource Owner
   * Password Credentials (ROPC) grant.
   *
   * @throws {AuthError} If the server rejects the credentials or returns a
   *   non-successful HTTP status code.
   */
  async authenticate(username: string, password: string): Promise<TokenSet> {
    const params = new URLSearchParams({
      grant_type: "password",
      client_id: this.clientId,
      username,
      password,
      scope: this.scope,
    });

    if (this.clientSecret) {
      params.set("client_secret", this.clientSecret);
    }

    return this.requestTokens(params);
  }

  /**
   * Obtains a fresh TokenSet by exchanging a refresh token.
   *
   * @throws {AuthError} If the refresh token has expired or is otherwise
   *   rejected by the server.
   */
  async refreshToken(currentTokens: TokenSet): Promise<TokenSet> {
    // Guard against locally known expiry before making a network call.
    if (
      currentTokens.refreshTokenExpiresAt !== undefined &&
      currentTokens.refreshTokenExpiresAt <= new Date()
    ) {
      throw new AuthError(
        "Refresh token has expired.",
        undefined,
        "invalid_grant",
        "The refresh token has expired."
      );
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      refresh_token: currentTokens.refreshToken,
      scope: this.scope,
    });

    if (this.clientSecret) {
      params.set("client_secret", this.clientSecret);
    }

    return this.requestTokens(params);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async requestTokens(params: URLSearchParams): Promise<TokenSet> {
    let response: Response;

    try {
      const fetchOptions = await this.buildFetchOptions(params);
      response = await fetch(this.tokenEndpoint, fetchOptions);
    } catch (networkError) {
      if (networkError instanceof AuthError) throw networkError;
      throw new AuthError(
        `Network request to token endpoint failed: ${(networkError as Error).message}`
      );
    }

    // Parse the body regardless of status so we can forward server error details.
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AuthError(
        `Token endpoint returned a non-JSON response (HTTP ${response.status}).`,
        response.status
      );
    }

    if (!response.ok) {
      const errorBody = body as Record<string, unknown>;
      const serverError = typeof errorBody?.error === "string" ? errorBody.error : undefined;
      const description =
        typeof errorBody?.error_description === "string"
          ? errorBody.error_description
          : undefined;

      // Provide a helpful, specific message for the most common error codes.
      let message: string;
      switch (serverError) {
        case "invalid_grant":
          message =
            description?.toLowerCase().includes("refresh")
              ? "Refresh token has expired or is invalid."
              : "Invalid credentials or grant.";
          break;
        case "invalid_client":
          message = "Client authentication failed (invalid client_id or client_secret).";
          break;
        case "unauthorized_client":
          message = "This client is not authorised to use the requested grant type.";
          break;
        default:
          message = `Authentication failed (HTTP ${response.status})${serverError ? `: ${serverError}` : ""}.`;
      }

      throw new AuthError(message, response.status, serverError, description);
    }

    // Validate the successful response structure before parsing
    if (!isValidTokenResponse(body)) {
      throw new AuthError(
        `Token endpoint returned invalid response structure (HTTP ${response.status}).`,
        response.status
      );
    }

    return OidcAuthManager.parseTokenResponse(body);
  }

  private async buildFetchOptions(params: URLSearchParams): Promise<RequestInit> {
    const base: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    };

    if (!this.proxy) return base;

    // Node's built-in fetch does not support a proxy option, so we open a
    // raw CONNECT tunnel and hand the socket to fetch via a custom dispatcher
    // (undici) — which IS the engine behind Node 18+ native fetch.
    //
    // If running in an environment without undici (e.g. a browser bundler),
    // we fall back to a best-effort approach using the HTTP_PROXY env var
    // guidance and warn the developer.
    try {
      const url = new URL(this.tokenEndpoint);
      const useTls = url.protocol === "https:";
      const targetPort = url.port
        ? parseInt(url.port, 10)
        : useTls ? DEFAULT_HTTPS_PORT : DEFAULT_HTTP_PORT;

      const proxyAgent = new Agent({
        connect: async (options: any, callback: any) => {
          try {
            const socket = await ProxyTunnel.connect(
              this.proxy!,
              url.hostname,
              targetPort,
              useTls
            );
            // undici expects the raw socket handed back via callback(err, socket)
            callback(null, socket);
          } catch (err) {
            callback(err as Error);
          }
        },
      } as any);

      // Use proper typing for undici dispatcher
      return { ...base, dispatcher: proxyAgent } as RequestInit & { dispatcher: any };
    } catch {
      // undici not available — surface a clear error rather than silently ignoring the proxy.
      throw new AuthError(
        "Proxy support requires the 'undici' package (bundled with Node.js 18+). " +
          "In environments without undici, configure the proxy at the HTTP client or OS level."
      );
    }
  }

  private static parseTokenResponse(raw: TokenResponse): TokenSet {
    const now = Date.now();

    const accessTokenExpiresAt = new Date(now + raw.expires_in * 1000);

    const refreshTokenExpiresAt =
      typeof raw.refresh_expires_in === "number" && raw.refresh_expires_in > 0
        ? new Date(now + raw.refresh_expires_in * 1000)
        : undefined;

    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      tokenType: raw.token_type ?? "Bearer",
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      scope: raw.scope,
    };
  }
}
