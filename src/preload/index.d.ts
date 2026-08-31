export interface MeboApi {
  loadMaterialsFile: () => Promise<string>
}

declare global {
  interface Window {
    api: MeboApi
  }
}
