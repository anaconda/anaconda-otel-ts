// SPDX-FileCopyrightText: 2025 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      extensionsToTreatAsEsm: ['.ts'],
      testMatch: ['<rootDir>/tests/unit/**/*.(spec|test).ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1'
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: true }]
      },
      collectCoverageFrom: ['src/**/*.ts'],
      coveragePathIgnorePatterns: [
        "/node_modules/",
        "/integration_tests/"
      ]
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      extensionsToTreatAsEsm: ['.ts'],
      testMatch: ['<rootDir>/tests/integration/**/*.(spec|test|e2e).ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1'
      },
      transform: {
        ...tsJestTransformCfg,
      },
      testTimeout: 30000
    }
  ]
};
