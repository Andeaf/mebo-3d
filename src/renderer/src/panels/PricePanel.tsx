import type { ReactElement } from 'react'
import type { MaterialCategory, PriceUnit } from '@core/materials'
import type { QuoteLine } from '@core/pricing'
import type { SceneQuote } from '@core/scenePricing'
import { useSceneQuote } from '@state/selectors'
import { useAppStore } from '@state/store'
import { formatEur, formatQuantity } from '../format'
import { useT, type TranslationKey } from '../i18n'

const CATEGORY_ORDER: readonly MaterialCategory[] = ['board', 'edgeband', 'hardware']

const CATEGORY_LABEL_KEYS: Readonly<Record<MaterialCategory, TranslationKey>> = {
  board: 'price.category.board',
  edgeband: 'price.category.edgeband',
  hardware: 'price.category.hardware'
}

const UNIT_LABEL_KEYS: Readonly<Record<PriceUnit, TranslationKey>> = {
  m2: 'unit.m2',
  m: 'unit.m',
  piece: 'unit.piece'
}

function QuoteLineRow({ line }: { line: QuoteLine }): ReactElement {
  const t = useT()
  const unitLabel = t(UNIT_LABEL_KEYS[line.unit])
  return (
    <tr>
      <td>
        <span className="quote__description">{line.description}</span>
        <span className="quote__unit-price">
          {formatEur(line.unitPriceEur)}/{unitLabel}
        </span>
      </td>
      <td className="quote__qty">
        {formatQuantity(line.quantity)} {unitLabel}
      </td>
      <td className="quote__amount">{formatEur(line.totalEur)}</td>
    </tr>
  )
}

function CategoryBlock({
  category,
  sceneQuote
}: {
  category: MaterialCategory
  sceneQuote: SceneQuote
}): ReactElement | null {
  const t = useT()
  const lines = sceneQuote.materialTotals.filter((line) => line.category === category)
  if (lines.length === 0) {
    return null
  }
  return (
    <tbody>
      <tr className="quote__category-row">
        <th colSpan={3}>{t(CATEGORY_LABEL_KEYS[category])}</th>
      </tr>
      {lines.map((line) => (
        <QuoteLineRow key={line.materialId} line={line} />
      ))}
      <tr className="quote__subtotal-row">
        <td colSpan={2}>{t('price.subtotal')}</td>
        <td className="quote__amount">{formatEur(sceneQuote.subtotalsEur[category])}</td>
      </tr>
    </tbody>
  )
}

export function PricePanel(): ReactElement {
  const t = useT()
  const sceneQuote = useSceneQuote()
  const materialsState = useAppStore((state) => state.materialsState)
  const materialsError = useAppStore((state) => state.materialsError)

  return (
    <section className="panel panel--price">
      <h2 className="panel__title">{t('price.title')}</h2>

      {materialsState === 'loading' && <p className="panel__note">{t('price.loading')}</p>}
      {materialsState === 'error' && (
        <p className="panel__error">
          {t('price.loadError')} {materialsError}
        </p>
      )}

      {sceneQuote !== null && (
        <>
          <table className="quote">
            {CATEGORY_ORDER.map((category) => (
              <CategoryBlock key={category} category={category} sceneQuote={sceneQuote} />
            ))}
          </table>
          <div className="quote__total-row">
            <span>{t('price.total')}</span>
            <span className="quote__total-amount">{formatEur(sceneQuote.totalEur)}</span>
          </div>
          {sceneQuote.missingMaterialIds.length > 0 && (
            <p className="panel__error">
              {t('price.missing')} {sceneQuote.missingMaterialIds.join(', ')}
            </p>
          )}
        </>
      )}
    </section>
  )
}
