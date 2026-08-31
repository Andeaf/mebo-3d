import { useEffect, type ReactElement } from 'react'
import { JsonMaterialRepository } from '@core/repository/MaterialRepository'
import { useAppStore } from '@state/store'
import { useT } from './i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ParameterPanel } from './panels/ParameterPanel'
import { PricePanel } from './panels/PricePanel'
import { Toolbar } from './toolbar/Toolbar'
import { Viewport } from './viewport/Viewport'

const materialRepository = new JsonMaterialRepository(() => window.api.loadMaterialsFile())

export default function App(): ReactElement {
  const t = useT()
  const loadMaterials = useAppStore((state) => state.loadMaterials)

  useEffect(() => {
    void loadMaterials(materialRepository)
  }, [loadMaterials])

  return (
    <div className="app">
      <main className="viewport-area">
        <Viewport />
        <Toolbar />
      </main>
      <aside className="sidebar">
        <header className="sidebar__header">
          <div>
            <h1>{t('app.title')}</h1>
            <p>{t('app.subtitle')}</p>
          </div>
          <LanguageSwitcher />
        </header>
        <ParameterPanel />
        <PricePanel />
      </aside>
    </div>
  )
}
