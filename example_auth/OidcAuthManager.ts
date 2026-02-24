import { Agent } from "undici";

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

    // 1. Open a plain TCP connection to the proxy.
    const proxySocket = await new Promise<import("net").Socket>((resolve, reject) => {
      const s = net.createConnection({ host: proxy.host, port: proxy.port }, () =>
        resolve(s)
      );
      s.once("error", reject);
    });

    // 2. Send a CONNECT request to the proxy.
    const authHeader = proxy.auth
      ? `Proxy-Authorization: Basic ${Buffer.from(
          `${proxy.auth.username}:${proxy.auth.password}`
        ).toString("base64")}\r\n`
      : "";

    await new Promise<void>((resolve, reject) => {
      proxySocket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${authHeader}\r\n`
      );

      let buf = "";
      const onData = (chunk: Buffer) => {
        buf += chunk.toString();
        // The proxy response ends with a blank line.
        if (!buf.includes("\r\n\r\n")) return;
        proxySocket.off("data", onData);

        const statusLine = buf.split("\r\n")[0];
        const statusCode = parseInt(statusLine.split(" ")[1], 10);
        if (statusCode === 200) {
          resolve();
        } else {
          reject(
            new AuthError(
              `Proxy CONNECT failed: ${statusLine}`,
              statusCode
            )
          );
        }
      };
      proxySocket.on("data", onData);
      proxySocket.once("error", reject);
    });

    if (!useTls) return proxySocket;

    // 3. Upgrade the tunnel to TLS for HTTPS targets.
    return new Promise<import("tls").TLSSocket>((resolve, reject) => {
      const tlsSocket = tls.connect(
        { socket: proxySocket, servername: targetHost },
        () => resolve(tlsSocket)
      );
      tlsSocket.once("error", reject);
    });
  }
}

class AuthError extends Error {
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
    this.tokenEndpoint = config.tokenEndpoint;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.scope = config.scope ?? "openid";
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
    let body: Record<string, unknown>;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new AuthError(
        `Token endpoint returned a non-JSON response (HTTP ${response.status}).`,
        response.status
      );
    }

    if (!response.ok) {
      const serverError = typeof body.error === "string" ? body.error : undefined;
      const description =
        typeof body.error_description === "string"
          ? body.error_description
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

    return OidcAuthManager.parseTokenResponse(body as unknown as TokenResponse);
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
      const targetPort = url.port ? parseInt(url.port, 10) : useTls ? 443 : 80;

      const proxyAgent = new Agent({
        connect: async (_opts: Record<string, unknown>, callback: Function) => {
          try {
            const socket = await ProxyTunnel.connect(
              this.proxy!,
              url.hostname,
              targetPort,
              useTls
            );
            // undici expects the raw socket handed back via callback(err, socket)
            (callback as (err: null, socket: import("net").Socket) => void)(null, socket as import("net").Socket);
          } catch (err) {
            (callback as (err: Error) => void)(err as Error);
          }
        },
      } as ConstructorParameters<typeof Agent>[0]);

      // @ts-ignore — `dispatcher` is an undici-specific fetch extension not in the DOM types
      return { ...base, dispatcher: proxyAgent };
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
