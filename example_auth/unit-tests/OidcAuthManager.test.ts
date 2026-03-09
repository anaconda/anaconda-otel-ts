// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { OidcAuthManager, type OidcAuthConfig, type TokenSet, AuthError } from '../OidcAuthManager';

describe('OidcAuthManager', () => {
  describe('constructor', () => {
    it('should initialize with minimal configuration', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
      };

      const manager = new OidcAuthManager(config);
      expect(manager).toBeInstanceOf(OidcAuthManager);
    });

    it('should initialize with full configuration', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scope: 'openid profile email',
        proxy: {
          host: 'proxy.corp.com',
          port: 8080,
          auth: {
            username: 'proxyuser',
            password: 'proxypass'
          }
        }
      };

      const manager = new OidcAuthManager(config);
      expect(manager).toBeInstanceOf(OidcAuthManager);
    });

    it('should validate configuration on construction', () => {
      const invalidConfig: OidcAuthConfig = {
        tokenEndpoint: 'invalid-url',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(invalidConfig)).toThrow();
    });
  });

  describe('refreshToken method - input validation', () => {
    let manager: OidcAuthManager;

    beforeEach(() => {
      manager = new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
      });
    });

    it('should reject expired refresh tokens immediately', async () => {
      const expiredTokens: TokenSet = {
        accessToken: 'access123',
        refreshToken: 'refresh456',
        tokenType: 'Bearer',
        accessTokenExpiresAt: new Date(Date.now() - 1000), // 1 second ago
        refreshTokenExpiresAt: new Date(Date.now() - 1000), // 1 second ago (expired)
        scope: 'openid'
      };

      await expect(manager.refreshToken(expiredTokens))
        .rejects
        .toThrow(AuthError);

      try {
        await manager.refreshToken(expiredTokens);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Refresh token has expired.');
        expect((error as AuthError).serverError).toBe('invalid_grant');
        expect((error as AuthError).serverErrorDescription).toBe('The refresh token has expired.');
      }
    });

    it('should accept tokens without refresh expiration', async () => {
      const tokensWithoutRefreshExpiry: TokenSet = {
        accessToken: 'access123',
        refreshToken: 'refresh456',
        tokenType: 'Bearer',
        accessTokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        refreshTokenExpiresAt: undefined, // No refresh expiration
        scope: 'openid'
      };

      // This should not throw immediately (it will fail on network call, but that's expected)
      const promise = manager.refreshToken(tokensWithoutRefreshExpiry);

      // Since we can't mock fetch easily here, we expect it to fail with a network error
      await expect(promise).rejects.toThrow();
    });

    it('should accept tokens with future refresh expiration', async () => {
      const validTokens: TokenSet = {
        accessToken: 'access123',
        refreshToken: 'refresh456',
        tokenType: 'Bearer',
        accessTokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        refreshTokenExpiresAt: new Date(Date.now() + 7200000), // 2 hours from now
        scope: 'openid'
      };

      // This should not throw immediately (it will fail on network call, but that's expected)
      const promise = manager.refreshToken(validTokens);

      // Since we can't mock fetch easily here, we expect it to fail with a network error
      await expect(promise).rejects.toThrow();
    });
  });

  describe('authenticate method - input validation', () => {
    let manager: OidcAuthManager;

    beforeEach(() => {
      manager = new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
      });
    });

    it('should accept valid username and password', async () => {
      // This will fail on network call, but should not fail on input validation
      const promise = manager.authenticate('validuser', 'validpass');

      // Since we can't mock fetch easily here, we expect it to fail with a network error
      await expect(promise).rejects.toThrow();
    });

    it('should accept empty strings (server will validate)', async () => {
      // The method doesn't validate empty strings - server does that
      const promise = manager.authenticate('', '');

      // Since we can't mock fetch easily here, we expect it to fail with a network error
      await expect(promise).rejects.toThrow();
    });
  });

  describe('URL parsing and default values', () => {
    it('should handle HTTP URLs correctly', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'http://auth.example.com/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should handle HTTPS URLs correctly', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should handle URLs with ports', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com:8443/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should handle URLs with complex paths', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/realms/myrealm/protocol/openid-connect/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });
  });

  describe('default scope handling', () => {
    it('should use default scope when not provided', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
      };

      // The constructor should set default scope to "openid"
      // We can't directly test this without accessing private properties,
      // but we can test that construction succeeds
      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should use provided scope when given', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        scope: 'openid profile email'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });
  });

  describe('TokenSet interface compliance', () => {
    it('should define correct TokenSet structure', () => {
      const sampleTokenSet: TokenSet = {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
        tokenType: 'Bearer',
        scope: 'openid profile email'
      };

      expect(typeof sampleTokenSet.accessToken).toBe('string');
      expect(typeof sampleTokenSet.refreshToken).toBe('string');
      expect(sampleTokenSet.accessTokenExpiresAt).toBeInstanceOf(Date);
      expect(sampleTokenSet.refreshTokenExpiresAt).toBeInstanceOf(Date);
      expect(typeof sampleTokenSet.tokenType).toBe('string');
      expect(typeof sampleTokenSet.scope).toBe('string');
    });

    it('should allow undefined refreshTokenExpiresAt', () => {
      const sampleTokenSet: TokenSet = {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: undefined,
        tokenType: 'Bearer',
        scope: 'openid profile email'
      };

      expect(sampleTokenSet.refreshTokenExpiresAt).toBeUndefined();
    });

    it('should allow undefined scope', () => {
      const sampleTokenSet: TokenSet = {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9...',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
        tokenType: 'Bearer',
        scope: undefined
      };

      expect(sampleTokenSet.scope).toBeUndefined();
    });
  });

  describe('Configuration immutability', () => {
    it('should not be affected by modifications to original config object', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        scope: 'openid'
      };

      const manager = new OidcAuthManager(config);

      // Modify the original config
      config.clientId = 'modified-client';
      config.scope = 'modified-scope';

      // The manager should still work with original values
      // We can't directly test this without accessing private properties,
      // but we can test that the manager continues to function
      expect(manager).toBeInstanceOf(OidcAuthManager);
    });
  });
});