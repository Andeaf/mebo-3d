import { useEffect, type ReactElement } from 'react'
import { JsonMaterialRepository } from '@core/repository/MaterialRepository'
import { useAppStore } from '@state/store'
import { t } from './i18n/nl'
import { ParameterPanel } from './panels/ParameterPanel'
import { PricePanel } from './panels/PricePanel'
import { Viewport } from './viewport/Viewport'

const materialRepository = new JsonMaterialRepository(() => window.api.loadMaterialsFile())

export default function App(): ReactElement {
  const loadMaterials = useAppStore((state) => state.loadMaterials)

  useEffect(() => {
    void loadMaterials(materialRepository)
  }, [loadMaterials])

  return (
    <div className="app">
      <main className="viewport-area">
        <Viewport />
      </main>
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </header>
        <ParameterPanel />
        <PricePanel />
      </aside>
    </div>
  )
}
