import { useEffect, type ReactElement } from 'react'
import { JsonMaterialRepository } from '@core/repository/MaterialRepository'
import { useSelectedCabinet } from '@state/selectors'
import { useAppStore } from '@state/store'
import { useT } from './i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ParameterPanel } from './panels/ParameterPanel'
import { PricePanel } from './panels/PricePanel'
import { RoomPanel } from './panels/RoomPanel'
import { WorktopPanel } from './panels/WorktopPanel'
import { PieceEditor } from './piece/PieceEditor'
import { PiecePricePanel } from './piece/PiecePricePanel'
import { ProjectBridge } from './project/ProjectBridge'
import { ProjectNotice } from './project/ProjectNotice'
import { Toolbar } from './toolbar/Toolbar'
import { SelectedReadout } from './viewport/SelectedReadout'
import { Viewport } from './viewport/Viewport'

const materialRepository = new JsonMaterialRepository(() => window.api.loadMaterialsFile())

/** The sidebar body: the piece editor while a custom piece is open, the scene panels otherwise. */
function SidebarPanels(): ReactElement {
  const editingPieceId = useAppStore((state) => state.editor.editingPieceId)
  const selected = useSelectedCabinet()
  if (
    editingPieceId !== null &&
    selected !== null &&
    selected.id === editingPieceId &&
    selected.design.kind === 'custom-piece'
  ) {
    return (
      <>
        <PieceEditor placed={selected} spec={selected.design.spec} />
        <PiecePricePanel design={selected.design} />
      </>
    )
  }
  return (
    <>
      <RoomPanel />
      <WorktopPanel />
      <ParameterPanel />
      <PricePanel />
    </>
  )
}

export default function App(): ReactElement {
  const t = useT()
  const loadMaterials = useAppStore((state) => state.loadMaterials)

  useEffect(() => {
    void loadMaterials(materialRepository)
  }, [loadMaterials])

  return (
    <div className="app">
      <ProjectBridge />
      <main className="viewport-area">
        <Viewport />
        <Toolbar />
        <SelectedReadout />
      </main>
      <aside className="sidebar">
        <header className="sidebar__header">
          <div>
            <h1>{t('app.title')}</h1>
            <p>{t('app.subtitle')}</p>
          </div>
          <LanguageSwitcher />
        </header>
        <ProjectNotice />
        <SidebarPanels />
      </aside>
    </div>
  )
}
