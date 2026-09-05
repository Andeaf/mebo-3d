import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** package.json's version, baked into the renderer as `__APP_VERSION__` (project metadata). */
function appVersion(): string {
  const parsed: unknown = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string') {
    return parsed.version
  }
  throw new Error('package.json has no string "version"')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@core': resolve('src/core'),
        '@state': resolve('src/state')
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion())
    },
    plugins: [react()]
  }
})
