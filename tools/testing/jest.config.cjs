/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/../../src', '<rootDir>/../../tests', '<rootDir>/../../server'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: '<rootDir>/../../tsconfig.json',
      useESM: true
    }]
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../../src/$1',
    '^@components/(.*)$': '<rootDir>/../../src/components/$1',
    '^@services/(.*)$': '<rootDir>/../../src/services/$1',
    '^@hooks/(.*)$': '<rootDir>/../../src/hooks/$1',
    '^@types/(.*)$': '<rootDir>/../../src/types/$1',
    '^@utils/(.*)$': '<rootDir>/../../src/utils/$1',
    '^@store/(.*)$': '<rootDir>/../../src/store/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/../../tests/__mocks__/fileMock.js',
    '^../../server/(.*)$': '<rootDir>/../../server/$1',
    '^.+/apiClient(\\.ts)?$': '<rootDir>/../../tests/__mocks__/apiClient.ts',
    '^.+/websocket(\\.ts)?$': '<rootDir>/../../tests/__mocks__/websocket.ts',
    '^.+/websocketService(\\.ts)?$': '<rootDir>/../../tests/__mocks__/websocket.ts'
  },
  setupFilesAfterEnv: ['<rootDir>/../../tests/setupTests.ts', '<rootDir>/../../server/tests/setup.ts'],
  collectCoverageFrom: [
    '<rootDir>/../../src/**/*.{ts,tsx}',
    '<rootDir>/../../server/**/*.{ts,tsx}',
    '!<rootDir>/../../src/**/*.d.ts',
    '!<rootDir>/../../src/types/**/*',
    '!<rootDir>/../../src/**/*.stories.tsx',
    '!<rootDir>/../../src/vite-env.d.ts',
    '!<rootDir>/../../src/main.tsx',
    '!<rootDir>/../../server/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 10000,
  // Environment variables for tests
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  }
}