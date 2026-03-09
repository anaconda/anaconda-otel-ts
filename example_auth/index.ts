// SPDX-FileCopyrightText: 2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

/**
 * OIDC Authentication Manager
 *
 * This module provides a comprehensive OIDC/OAuth2 authentication client with
 * support for Resource Owner Password Credentials (ROPC) grant and token refresh,
 * including optional HTTP proxy support.
 *
 * @example
 * ```typescript
 * import { OidcAuthManager, type OidcAuthConfig } from './';
 *
 * const config: OidcAuthConfig = {
 *   tokenEndpoint: 'https://auth.example.com/realms/myrealm/protocol/openid-connect/token',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-client-secret', // optional for public clients
 *   scope: 'openid profile email'     // optional, defaults to 'openid'
 * };
 *
 * const authManager = new OidcAuthManager(config);
 *
 * try {
 *   const tokens = await authManager.authenticate('username', 'password');
 *   console.log('Access token:', tokens.accessToken);
 *
 *   // Later, refresh the tokens
 *   const refreshedTokens = await authManager.refreshToken(tokens);
 * } catch (error) {
 *   if (error instanceof AuthError) {
 *     console.error('Authentication failed:', error.message);
 *     console.error('Server error:', error.serverError);
 *   }
 * }
 * ```
 */

// Re-export public interfaces
export type {
  /**
   * Represents a token set returned by the OIDC/OAuth2 provider.
   * Contains access token, refresh token, and expiration information.
   */
  TokenSet,

  /**
   * Optional HTTP/HTTPS proxy configuration.
   * Used when the application needs to route requests through a corporate proxy.
   */
  ProxyConfig,

  /**
   * Configuration required to initialize the OidcAuthManager.
   * Includes token endpoint, client credentials, and optional proxy settings.
   */
  OidcAuthConfig
} from './OidcAuthManager';

// Re-export public classes
export {
  /**
   * Main OIDC authentication manager class.
   * Provides methods for password-based authentication and token refresh.
   */
  OidcAuthManager,

  /**
   * Custom error class for authentication failures.
   * Provides structured error information including HTTP status codes
   * and OAuth2-specific error details from the server.
   */
  AuthError
} from './OidcAuthManager';