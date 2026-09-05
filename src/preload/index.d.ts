import type { MeboApi } from './api'

declare global {
  interface Window {
    api: MeboApi
  }
}

export {}
