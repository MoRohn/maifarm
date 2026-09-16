/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/../../apps/api/src'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'esnext',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        resolveJsonModule: true,
        isolatedModules: true
      }
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/../../apps/dashboard/src/$1',
    '^@server/(.*)$': '<rootDir>/../../apps/api/src/$1',
    '^@shared/(.*)$': '<rootDir>/../../apps/shared/$1'
  },
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  collectCoverageFrom: [
    '<rootDir>/../../apps/api/src/**/*.{ts,tsx}',
    '!<rootDir>/../../apps/api/src/**/*.d.ts',
    '!<rootDir>/../../apps/api/src/types/**/*',
    '!<rootDir>/../../apps/api/src/tests/**/*',
    '!<rootDir>/../../apps/api/src/index.ts'
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
  testTimeout: 30000,
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../../apps/api/src/tests/setup.ts'],
  // Handle import.meta.url
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  }
};
