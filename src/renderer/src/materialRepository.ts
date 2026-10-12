import { JsonMaterialRepository } from '@core/repository/MaterialRepository'

/**
 * The one repository the renderer prices with: the price-list text comes
 * over IPC from main (the user's file when packaged, the repo's in dev).
 * Shared by the start-up load (App) and Prices › Reload (ProjectBridge).
 */
export const materialRepository = new JsonMaterialRepository(() => window.api.loadMaterialsFile())
