import type { ReactElement } from 'react'
import type { MaterialCategory, PriceUnit } from '@core/materials'
import type { Quote, QuoteLine } from '@core/pricing'
import { useQuote } from '@state/selectors'
import { useAppStore } from '@state/store'
import { formatEur, formatQuantity } from '../format'
import { t, type TranslationKey } from '../i18n/nl'

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

function CategoryBlock({ category, quote }: { category: MaterialCategory; quote: Quote }): ReactElement | null {
  const lines = quote.lines.filter((line) => line.category === category)
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
        <td className="quote__amount">{formatEur(quote.subtotalsEur[category])}</td>
      </tr>
    </tbody>
  )
}

export function PricePanel(): ReactElement {
  const quote = useQuote()
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

      {quote !== null && (
        <>
          <table className="quote">
            {CATEGORY_ORDER.map((category) => (
              <CategoryBlock key={category} category={category} quote={quote} />
            ))}
          </table>
          <div className="quote__total-row">
            <span>{t('price.total')}</span>
            <span className="quote__total-amount">{formatEur(quote.totalEur)}</span>
          </div>
          {quote.missingMaterialIds.length > 0 && (
            <p className="panel__error">
              {t('price.missing')} {quote.missingMaterialIds.join(', ')}
            </p>
          )}
        </>
      )}
    </section>
  )
}
