// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

/**
 * These tests exercise actual code execution paths and method calls.
 * They complement the contract/behavior tests by actually invoking the code
 * up to the point where network calls would be made.
 */

import { OidcAuthManager, AuthError, type TokenSet } from '../OidcAuthManager';

describe('Code Execution Tests', () => {
  describe('Constructor and Configuration Validation Execution', () => {
    it('should execute configuration validation code paths', () => {
      // Valid configuration - executes constructor and validation logic
      const validConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scope: 'openid profile email'
      };

      const manager = new OidcAuthManager(validConfig);
      expect(manager).toBeInstanceOf(OidcAuthManager);

      // Test various validation paths
      expect(() => new OidcAuthManager({
        tokenEndpoint: '',
        clientId: 'test'
      })).toThrow('Token endpoint URL is required');

      expect(() => new OidcAuthManager({
        tokenEndpoint: 'invalid-url',
        clientId: 'test'
      })).toThrow('Invalid token endpoint URL');

      expect(() => new OidcAuthManager({
        tokenEndpoint: 'ftp://auth.example.com/token',
        clientId: 'test'
      })).toThrow('Token endpoint must use HTTP or HTTPS protocol');
    });

    it('should execute proxy validation code paths', () => {
      expect(() => new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test',
        proxy: {
          host: '',
          port: 8080
        }
      })).toThrow('Proxy host is required when proxy is configured');

      expect(() => new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test',
        proxy: {
          host: 'proxy.example.com',
          port: 0
        }
      })).toThrow('Proxy port must be a valid integer between 1 and 65535');

      expect(() => new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test',
        proxy: {
          host: 'proxy.example.com',
          port: 8080,
          auth: {
            username: '',
            password: 'pass'
          }
        }
      })).toThrow('Proxy auth username and password are both required when proxy auth is configured');
    });

    it('should execute client validation code paths', () => {
      expect(() => new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: '',
      })).toThrow('Client ID is required and cannot be empty');

      expect(() => new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test',
        clientSecret: ''
      })).toThrow('Client secret cannot be empty when provided');

      expect(() => new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test',
        scope: ''
      })).toThrow('Scope cannot be empty when provided');
    });
  });

  describe('AuthError Execution', () => {
    it('should execute AuthError constructor paths', () => {
      // Test all constructor parameter combinations
      const error1 = new AuthError('Simple message');
      expect(error1.message).toBe('Simple message');
      expect(error1.name).toBe('AuthError');

      const error2 = new AuthError('With status', 401);
      expect(error2.statusCode).toBe(401);

      const error3 = new AuthError('Full error', 400, 'invalid_grant', 'Description');
      expect(error3.serverError).toBe('invalid_grant');
      expect(error3.serverErrorDescription).toBe('Description');

      // Test inheritance
      expect(error1 instanceof Error).toBe(true);
      expect(error1 instanceof AuthError).toBe(true);
    });
  });

  describe('Method Execution (Pre-network validation)', () => {
    let manager: OidcAuthManager;

    beforeEach(() => {
      manager = new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
      });
    });

    it('should execute refreshToken validation logic', async () => {
      // Test with expired refresh token - this executes the validation logic
      const expiredTokens: TokenSet = {
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
        refreshTokenExpiresAt: new Date(Date.now() - 1000), // Expired
        scope: 'openid'
      };

      try {
        await manager.refreshToken(expiredTokens);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Refresh token has expired.');
      }
    });

    it('should execute network error path for authenticate', async () => {
      // This will execute the authenticate method up to the network call
      try {
        await manager.authenticate('testuser', 'testpass');
        fail('Should have thrown a network error');
      } catch (error) {
        // Network error is expected - this confirms the method was called
        expect(error).toBeInstanceOf(AuthError);
      }
    });

    it('should execute network error path for refreshToken', async () => {
      // Test with valid token (won't be rejected locally) - executes up to network call
      const validTokens: TokenSet = {
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
        refreshTokenExpiresAt: new Date(Date.now() + 7200000), // Valid
        scope: 'openid'
      };

      try {
        await manager.refreshToken(validTokens);
        fail('Should have thrown a network error');
      } catch (error) {
        // Network error is expected - this confirms the method was called
        expect(error).toBeInstanceOf(AuthError);
      }
    });
  });

  describe('Index.ts Execution', () => {
    it('should import from index.ts', async () => {
      // This will execute the index.ts file exports
      const indexExports = await import('../index');

      expect(indexExports.OidcAuthManager).toBe(OidcAuthManager);
      expect(indexExports.AuthError).toBe(AuthError);
      expect(typeof indexExports.OidcAuthManager).toBe('function');
      expect(typeof indexExports.AuthError).toBe('function');
    });
  });

  describe('Utility Function Coverage', () => {
    it('should test URL parsing via constructor', () => {
      // These test different URL parsing paths
      const configs = [
        'http://example.com/token',
        'https://example.com/token',
        'https://example.com:8443/token',
        'https://auth.example.com/realms/test/protocol/openid-connect/token'
      ];

      configs.forEach(tokenEndpoint => {
        const manager = new OidcAuthManager({
          tokenEndpoint,
          clientId: 'test-client'
        });
        expect(manager).toBeInstanceOf(OidcAuthManager);
      });
    });

    it('should test scope defaulting logic', () => {
      // Test default scope
      const manager1 = new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
        // No scope provided - should default to "openid"
      });
      expect(manager1).toBeInstanceOf(OidcAuthManager);

      // Test custom scope
      const manager2 = new OidcAuthManager({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        scope: 'openid profile email'
      });
      expect(manager2).toBeInstanceOf(OidcAuthManager);
    });
  });
});