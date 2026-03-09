# OIDC Auth Manager Unit Tests

This directory contains comprehensive unit tests for the OIDC Authentication Manager components that can be tested without network dependencies.

## Test Coverage

### What IS tested (Unit Tests):
- ✅ **Configuration validation** - All validation rules for `OidcAuthConfig`
- ✅ **Error handling** - `AuthError` class behavior and properties
- ✅ **Token response structure validation** - Input validation logic
- ✅ **Token parsing logic** - Date calculations and field mapping
- ✅ **Constructor behavior** - Initialization and validation
- ✅ **Input validation** - Parameter checking for public methods
- ✅ **Constants and defaults** - Default values and boundaries
- ✅ **Type safety** - Interface compliance and TypeScript types

### What is NOT tested (Requires Functional Tests):
- ❌ **Network calls** - Actual HTTP requests to OIDC servers
- ❌ **Proxy connections** - Real proxy tunnel establishment
- ❌ **TLS handshakes** - Certificate validation and encryption
- ❌ **End-to-end authentication flows** - Complete OIDC workflows
- ❌ **Server error responses** - Real server error handling
- ❌ **Token refresh with network** - Actual token refresh calls

## Test Files

- **`AuthError.test.ts`** - Tests for the custom error class
- **`validation.test.ts`** - Tests for configuration validation logic
- **`token-parsing.test.ts`** - Tests for token response validation and parsing
- **`OidcAuthManager.test.ts`** - Tests for the main class constructor and methods
- **`constants.test.ts`** - Tests for default values and constants
- **`code-execution.test.ts`** - Tests that exercise actual code execution paths

## Running the Tests

### Prerequisites
```bash
# Install dependencies (from this directory)
npm install
```

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

```

### Using Parent Project's Dependencies
If you prefer to use the parent project's Jest setup:

```bash
# From the project root
cd ../..
npm test -- example_auth/unit-tests/
```

## Test Strategy

### Unit Test Approach
These tests focus on **behavior and contract testing** without external dependencies:

1. **Configuration validation** - Testing all validation rules and error conditions
2. **Interface compliance** - Ensuring TypeScript interfaces work correctly
3. **Error handling** - Testing custom error class behavior
4. **Input validation** - Testing parameter checking and edge cases
5. **Default values** - Testing configuration defaults and constants

### Mocking Strategy
- **Minimal mocking** - Tests focus on logic that doesn't require network
- **Time mocking** - For date/expiration calculations using `jest.fn()`
- **No network mocking** - Network-dependent tests belong in functional test suite

### Testing Philosophy
- **Contract testing** over code coverage - We test what the API promises to do
- **Behavior validation** - Testing expected outcomes for given inputs
- **Error scenarios** - Comprehensive testing of all error conditions
- **Type safety** - Compile-time and runtime type checking

## Integration with Functional Tests

These unit tests complement functional/integration tests:

- **Unit tests** (this directory): Fast, isolated, no network dependencies
- **Functional tests** (separate): End-to-end flows with real/mocked servers
- **Integration tests**: Cross-component interactions with network calls

## Contributing

When adding new unit tests:

1. **Focus on pure logic** - No network calls or external dependencies
2. **Test edge cases** - Boundary conditions and error paths
3. **Maintain fast execution** - Tests should run in milliseconds
4. **Use descriptive names** - Test names should clearly indicate what's being tested
5. **Follow existing patterns** - Match the structure of existing test files

## Example Test Run

```
PASS ./AuthError.test.ts
PASS ./validation.test.ts
PASS ./token-parsing.test.ts
PASS ./OidcAuthManager.test.ts
PASS ./constants.test.ts
PASS ./code-execution.test.ts

Test Suites: 6 passed, 6 total
Tests:       105 passed, 105 total
Snapshots:   0 total
Time:        0.5s
```