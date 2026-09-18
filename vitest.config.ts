import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Keep the aliases in sync with tsconfig.json and electron.vite.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@state': resolve('src/state')
    }
  },
  test: {
    environment: 'node',
    include: [
      'src/core/__tests__/**/*.test.ts',
      'src/state/__tests__/**/*.test.ts',
      'src/main/__tests__/**/*.test.ts'
    ]
  }
})
