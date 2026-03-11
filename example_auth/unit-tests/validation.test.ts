// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { OidcAuthManager, type OidcAuthConfig, AuthError } from '../OidcAuthManager';

describe('Configuration Validation', () => {
  describe('valid configurations', () => {
    it('should accept minimal valid HTTP configuration', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'http://auth.example.com/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should accept minimal valid HTTPS configuration', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should accept configuration with all optional fields', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scope: 'openid profile email'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should accept configuration with proxy', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: 'proxy.corp.com',
          port: 8080
        }
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should accept configuration with authenticated proxy', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: 'proxy.corp.com',
          port: 8080,
          auth: {
            username: 'proxyuser',
            password: 'proxypass'
          }
        }
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });
  });

  describe('invalid tokenEndpoint', () => {
    it('should reject empty token endpoint', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: '',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).toThrow('Token endpoint URL is required');
    });

    it('should reject whitespace-only token endpoint', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: '   ',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).toThrow('Token endpoint URL is required');
    });

    it('should reject invalid URL format', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'not-a-valid-url',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).toThrow('Invalid token endpoint URL');
    });

    it('should reject unsupported protocol', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'ftp://auth.example.com/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).toThrow('Token endpoint must use HTTP or HTTPS protocol');
    });
  });

  describe('invalid clientId', () => {
    it('should reject empty client ID', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: ''
      };

      expect(() => new OidcAuthManager(config)).toThrow('Client ID is required and cannot be empty');
    });

    it('should reject whitespace-only client ID', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: '   '
      };

      expect(() => new OidcAuthManager(config)).toThrow('Client ID is required and cannot be empty');
    });
  });

  describe('invalid clientSecret', () => {
    it('should reject empty client secret when provided', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: ''
      };

      expect(() => new OidcAuthManager(config)).toThrow('Client secret cannot be empty when provided');
    });

    it('should reject whitespace-only client secret', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: '   '
      };

      expect(() => new OidcAuthManager(config)).toThrow('Client secret cannot be empty when provided');
    });

    it('should accept undefined client secret', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: undefined
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });
  });

  describe('invalid scope', () => {
    it('should reject empty scope when provided', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        scope: ''
      };

      expect(() => new OidcAuthManager(config)).toThrow('Scope cannot be empty when provided');
    });

    it('should reject whitespace-only scope', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        scope: '   '
      };

      expect(() => new OidcAuthManager(config)).toThrow('Scope cannot be empty when provided');
    });

    it('should accept undefined scope', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        scope: undefined
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });
  });

  describe('invalid proxy configuration', () => {
    it('should reject empty proxy host', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: '',
          port: 8080
        }
      };

      expect(() => new OidcAuthManager(config)).toThrow('Proxy host is required when proxy is configured');
    });

    it('should reject whitespace-only proxy host', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: '   ',
          port: 8080
        }
      };

      expect(() => new OidcAuthManager(config)).toThrow('Proxy host is required when proxy is configured');
    });

    it('should reject invalid proxy port - too low', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: 'proxy.corp.com',
          port: 0
        }
      };

      expect(() => new OidcAuthManager(config)).toThrow('Proxy port must be a valid integer between 1 and 65535');
    });

    it('should reject invalid proxy port - too high', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: 'proxy.corp.com',
          port: 65536
        }
      };

      expect(() => new OidcAuthManager(config)).toThrow('Proxy port must be a valid integer between 1 and 65535');
    });

    it('should reject non-integer proxy port', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: 'proxy.corp.com',
          port: 8080.5
        }
      };

      expect(() => new OidcAuthManager(config)).toThrow('Proxy port must be a valid integer between 1 and 65535');
    });

    it('should reject incomplete proxy auth - missing username', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: 'proxy.corp.com',
          port: 8080,
          auth: {
            username: '',
            password: 'password'
          }
        }
      };

      expect(() => new OidcAuthManager(config)).toThrow('Proxy auth username and password are both required when proxy auth is configured');
    });

    it('should reject incomplete proxy auth - missing password', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: {
          host: 'proxy.corp.com',
          port: 8080,
          auth: {
            username: 'user',
            password: ''
          }
        }
      };

      expect(() => new OidcAuthManager(config)).toThrow('Proxy auth username and password are both required when proxy auth is configured');
    });
  });

  describe('edge cases', () => {
    it('should accept valid ports at boundaries', () => {
      const config1: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: { host: 'proxy.corp.com', port: 1 }
      };

      const config2: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'test-client',
        proxy: { host: 'proxy.corp.com', port: 65535 }
      };

      expect(() => new OidcAuthManager(config1)).not.toThrow();
      expect(() => new OidcAuthManager(config2)).not.toThrow();
    });

    it('should handle URLs with ports', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com:8443/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });

    it('should handle URLs with paths', () => {
      const config: OidcAuthConfig = {
        tokenEndpoint: 'https://auth.example.com/realms/myrealm/protocol/openid-connect/token',
        clientId: 'test-client'
      };

      expect(() => new OidcAuthManager(config)).not.toThrow();
    });
  });
});