import '@testing-library/jest-dom'

// This file is for TypeScript declarations that should be available in all test files
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R
      toBeDisabled(): R
      toHaveClass(className: string): R
    }
  }
}

export {}