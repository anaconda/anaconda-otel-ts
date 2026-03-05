# OIDC Authentication Manager

A production-ready TypeScript OIDC/OAuth2 authentication client with support for Resource Owner Password Credentials (ROPC) grant, token refresh, and HTTP proxy support.

## Features

- ✅ **OIDC/OAuth2 Authentication**: Resource Owner Password Credentials (ROPC) grant
- ✅ **Token Refresh**: Automatic token refresh with expiration handling
- ✅ **HTTP Proxy Support**: Including authenticated proxy connections
- ✅ **TypeScript**: Full type safety with comprehensive interfaces
- ✅ **Security**: Certificate validation, timeout handling, buffer overflow protection
- ✅ **Error Handling**: Structured error responses with OAuth2-specific details
- ✅ **Production Ready**: Comprehensive validation and robust error handling

## Requirements

- Node.js 18.17 or later
- TypeScript support
- `undici` package (included as dependency for proxy support)

## Installation

Include this file OidcAuthManager.ts directly in your project. If the project is a package and not a application include the contents of the index.ts file in your existing index.ts file.

## Quick Start

### Basic Authentication (No Proxy)

```typescript
import { OidcAuthManager, type OidcAuthConfig } from './example_auth/';

const config: OidcAuthConfig = {
  tokenEndpoint: 'https://auth.example.com/realms/myrealm/protocol/openid-connect/token',
  clientId: 'my-client-id',
  clientSecret: 'my-client-secret', // optional for public clients
  scope: 'openid profile email'     // optional, defaults to 'openid'
};

const authManager = new OidcAuthManager(config);

try {
  const tokens = await authManager.authenticate('username', 'password');
  console.log('Access token:', tokens.accessToken);
  console.log('Token expires at:', tokens.accessTokenExpiresAt);

  // Store tokens securely for later use
  // ...
} catch (error) {
  if (error instanceof AuthError) {
    console.error('Authentication failed:', error.message);
    console.error('HTTP Status:', error.statusCode);
    console.error('Server Error:', error.serverError);
  }
}
```

### With HTTP Proxy

```typescript
import { OidcAuthManager, type OidcAuthConfig } from './example_auth/';

const config: OidcAuthConfig = {
  tokenEndpoint: 'https://auth.example.com/realms/myrealm/protocol/openid-connect/token',
  clientId: 'my-client-id',
  clientSecret: 'my-client-secret',
  proxy: {
    host: 'proxy.corp.example.com',
    port: 3128,
    // Optional authentication
    auth: {
      username: 'proxy-user',
      password: 'proxy-pass'
    }
  }
};

const authManager = new OidcAuthManager(config);
// Same usage as above
```

### Token Refresh

```typescript
// Using previously obtained tokens
try {
  const refreshedTokens = await authManager.refreshToken(tokens);
  console.log('New access token:', refreshedTokens.accessToken);
  console.log('New expiration:', refreshedTokens.accessTokenExpiresAt);
} catch (error) {
  if (error instanceof AuthError) {
    // Refresh token might be expired, need to re-authenticate
    console.error('Token refresh failed:', error.message);
  }
}
```

## Configuration

### OidcAuthConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tokenEndpoint` | string | ✅ | Full URL of the OIDC token endpoint |
| `clientId` | string | ✅ | OAuth2 client identifier |
| `clientSecret` | string | ❌ | Client secret (required for confidential clients) |
| `scope` | string | ❌ | Space-separated scopes (default: "openid") |
| `proxy` | ProxyConfig | ❌ | HTTP proxy configuration |

### ProxyConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `host` | string | ✅ | Proxy hostname |
| `port` | number | ✅ | Proxy port (1-65535) |
| `auth` | object | ❌ | Proxy authentication credentials |
| `auth.username` | string | ❌ | Proxy username |
| `auth.password` | string | ❌ | Proxy password |

## Response Types

### TokenSet

```typescript
interface TokenSet {
  accessToken: string;                    // Bearer token for API calls
  refreshToken: string;                   // Token for refreshing access
  accessTokenExpiresAt: Date;            // Absolute expiration time
  refreshTokenExpiresAt: Date | undefined; // May be undefined
  tokenType: string;                      // Usually "Bearer"
  scope: string | undefined;              // Granted scopes
}
```

### AuthError

```typescript
class AuthError extends Error {
  statusCode?: number;           // HTTP status code
  serverError?: string;          // OAuth2 error code
  serverErrorDescription?: string; // Human-readable error description
}
```

## Error Handling

The library provides structured error handling through the `AuthError` class:

```typescript
try {
  const tokens = await authManager.authenticate('user', 'pass');
} catch (error) {
  if (error instanceof AuthError) {
    switch (error.serverError) {
      case 'invalid_grant':
        console.log('Invalid credentials');
        break;
      case 'invalid_client':
        console.log('Client authentication failed');
        break;
      case 'unauthorized_client':
        console.log('Client not authorized for this grant type');
        break;
      default:
        console.log('Authentication failed:', error.message);
    }
  }
}
```

## Common OAuth2 Error Codes

| Error Code | Description | Common Causes |
|------------|-------------|---------------|
| `invalid_grant` | Invalid username/password or expired refresh token | Wrong credentials, expired refresh token |
| `invalid_client` | Client authentication failed | Wrong client_id or client_secret |
| `unauthorized_client` | Client not authorized for grant type | ROPC not enabled for client |
| `invalid_request` | Malformed request | Missing required parameters |
| `unsupported_grant_type` | Grant type not supported | Server doesn't support password grant |

## Security Considerations

- **Credentials**: Never hardcode credentials. Use environment variables or secure configuration
- **Token Storage**: Store tokens securely (encrypted storage, secure keychain)
- **HTTPS**: Always use HTTPS token endpoints in production
- **Certificate Validation**: The library enforces proper TLS certificate validation
- **Timeouts**: Built-in connection and response timeouts prevent hanging requests
- **Proxy Security**: Proxy credentials are handled securely through HTTP CONNECT tunneling

## Best Practices

1. **Token Lifecycle Management**:
   ```typescript
   // Check expiration before using tokens
   if (tokens.accessTokenExpiresAt <= new Date()) {
     tokens = await authManager.refreshToken(tokens);
   }
   ```

2. **Error Recovery**:
   ```typescript
   try {
     tokens = await authManager.refreshToken(tokens);
   } catch (error) {
     if (error instanceof AuthError && error.serverError === 'invalid_grant') {
       // Refresh token expired, need full re-authentication
       tokens = await authManager.authenticate(username, password);
     }
   }
   ```

3. **Configuration Validation**:
   ```typescript
   // The library validates configuration at construction time
   try {
     const authManager = new OidcAuthManager(config);
   } catch (error) {
     console.error('Invalid configuration:', error.message);
   }
   ```

## Environment Variables

For proxy configuration, you can also rely on standard environment variables:

```bash
export HTTP_PROXY=http://proxy.corp.example.com:3128
export HTTPS_PROXY=http://proxy.corp.example.com:3128
```

Note: When using the `proxy` config option, it takes precedence over environment variables.

## Troubleshooting

### Common Issues

1. **"Proxy support requires the 'undici' package"**
   - Ensure you're running Node.js 18.17+ which includes undici
   - Verify undici is properly installed

2. **Certificate validation errors**
   - Ensure your token endpoint uses a valid SSL certificate
   - For development, ensure your test certificates are properly configured

3. **Connection timeouts**
   - Check network connectivity to the token endpoint
   - Verify proxy configuration if using corporate networks

4. **Invalid grant errors**
   - Verify username and password are correct
   - Check that ROPC grant is enabled on your OIDC provider
   - Ensure the client is configured for password grants

### Debug Information

Enable additional logging by catching and inspecting `AuthError` details:

```typescript
try {
  const tokens = await authManager.authenticate('user', 'pass');
} catch (error) {
  if (error instanceof AuthError) {
    console.log('Error details:', {
      message: error.message,
      statusCode: error.statusCode,
      serverError: error.serverError,
      serverErrorDescription: error.serverErrorDescription
    });
  }
}
```

## License

This component is licenced under Apache 2.0 license.
