// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

import { AuthError } from '../OidcAuthManager';

describe('AuthError', () => {
  describe('constructor', () => {
    it('should create an error with message only', () => {
      const error = new AuthError('Authentication failed');

      expect(error.name).toBe('AuthError');
      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBeUndefined();
      expect(error.serverError).toBeUndefined();
      expect(error.serverErrorDescription).toBeUndefined();
    });

    it('should create an error with message and status code', () => {
      const error = new AuthError('Authentication failed', 401);

      expect(error.name).toBe('AuthError');
      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.serverError).toBeUndefined();
      expect(error.serverErrorDescription).toBeUndefined();
    });

    it('should create an error with all parameters', () => {
      const error = new AuthError(
        'Invalid credentials',
        400,
        'invalid_grant',
        'The provided credentials are invalid'
      );

      expect(error.name).toBe('AuthError');
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(400);
      expect(error.serverError).toBe('invalid_grant');
      expect(error.serverErrorDescription).toBe('The provided credentials are invalid');
    });

    it('should extend Error class properly', () => {
      const error = new AuthError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AuthError);
      expect(error.stack).toBeDefined();
    });
  });

  describe('properties', () => {
    it('should have readonly statusCode property', () => {
      const error = new AuthError('Test', 500);

      expect(error.statusCode).toBe(500);

      // TypeScript should prevent this, but testing at runtime
      expect(() => {
        (error as any).statusCode = 400;
      }).not.toThrow();
      // Note: readonly only works at compile time, not runtime
    });

    it('should handle undefined optional parameters', () => {
      const error = new AuthError('Test', undefined, undefined, undefined);

      expect(error.statusCode).toBeUndefined();
      expect(error.serverError).toBeUndefined();
      expect(error.serverErrorDescription).toBeUndefined();
    });
  });

  describe('error serialization', () => {
    it('should serialize custom properties to JSON', () => {
      const error = new AuthError('Test error', 401, 'unauthorized', 'Invalid token');
      const serialized = JSON.parse(JSON.stringify(error));

      // Note: Built-in Error properties (name, message) are non-enumerable and don't serialize
      // but our custom properties should serialize
      expect(serialized.statusCode).toBe(401);
      expect(serialized.serverError).toBe('unauthorized');
      expect(serialized.serverErrorDescription).toBe('Invalid token');
    });

    it('should preserve all properties when accessed directly', () => {
      const error = new AuthError('Test error', 401, 'unauthorized', 'Invalid token');

      expect(error.name).toBe('AuthError');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(401);
      expect(error.serverError).toBe('unauthorized');
      expect(error.serverErrorDescription).toBe('Invalid token');
    });

    it('should work with error reporting tools', () => {
      const error = new AuthError('Network error', 503);
      const errorMessage = error.toString();

      expect(errorMessage).toBe('AuthError: Network error');
    });
  });
});