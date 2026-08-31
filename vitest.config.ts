import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve('src/core')
    }
  },
  test: {
    environment: 'node',
    include: ['src/core/__tests__/**/*.test.ts']
  }
})
