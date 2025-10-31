import { defineConfig } from 'cypress'
import path from 'path'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4173',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    setupNodeEvents(on, config) {
      // Performance monitoring
      on('task', {
        log(message) {
          console.log(message)
          return null
        },
        table(message) {
          console.table(message)
          return null
        }
      })

      // Code coverage
      require('@cypress/code-coverage/task')(on, config)

      // Visual regression testing
      on('after:screenshot', (details) => {
        console.log('Screenshot taken:', details)
      })

      return config
    },
    env: {
      coverage: true,
      codeCoverage: {
        exclude: ['cypress/**/*.*']
      }
    },
    retries: {
      runMode: 2,
      openMode: 0
    }
  },
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
      viteConfig: path.resolve(__dirname, 'apps/dashboard/vite.config.ts')
    },
    specPattern: 'apps/dashboard/src/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/component.ts'
  }
})
