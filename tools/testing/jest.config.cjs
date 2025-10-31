/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/../../apps/dashboard/src', '<rootDir>/../../tests', '<rootDir>/../../apps/api/src'],
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
    '^@/(.*)$': '<rootDir>/../../apps/dashboard/src/$1',
    '^@components/(.*)$': '<rootDir>/../../apps/dashboard/src/components/$1',
    '^@services/(.*)$': '<rootDir>/../../apps/dashboard/src/services/$1',
    '^@hooks/(.*)$': '<rootDir>/../../apps/dashboard/src/hooks/$1',
    '^@types/(.*)$': '<rootDir>/../../apps/dashboard/src/types/$1',
    '^@utils/(.*)$': '<rootDir>/../../apps/dashboard/src/utils/$1',
    '^@store/(.*)$': '<rootDir>/../../apps/dashboard/src/store/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/../../tests/__mocks__/fileMock.js',
    '^@shared/(.*)$': '<rootDir>/../../apps/shared/$1',
    '^../../apps/api/src/(.*)$': '<rootDir>/../../apps/api/src/$1',
    '^.+/apiClient(\\.ts)?$': '<rootDir>/../../tests/__mocks__/apiClient.ts',
    '^.+/websocket(\\.ts)?$': '<rootDir>/../../tests/__mocks__/websocket.ts',
    '^.+/websocketService(\\.ts)?$': '<rootDir>/../../tests/__mocks__/websocket.ts'
  },
  setupFilesAfterEnv: ['<rootDir>/../../tests/setupTests.ts', '<rootDir>/../../apps/api/src/tests/setup.ts'],
  collectCoverageFrom: [
    '<rootDir>/../../apps/dashboard/src/**/*.{ts,tsx}',
    '<rootDir>/../../apps/api/src/**/*.{ts,tsx}',
    '!<rootDir>/../../apps/dashboard/src/**/*.d.ts',
    '!<rootDir>/../../apps/dashboard/src/types/**/*',
    '!<rootDir>/../../apps/dashboard/src/**/*.stories.tsx',
    '!<rootDir>/../../apps/dashboard/src/vite-env.d.ts',
    '!<rootDir>/../../apps/dashboard/src/main.tsx',
    '!<rootDir>/../../apps/api/src/**/*.d.ts'
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
