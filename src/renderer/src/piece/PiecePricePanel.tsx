import { useMemo, type ReactElement } from 'react'
import type { CabinetDesign } from '@core/cabinet'
import { quoteForDesign } from '@core/pricing'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'
import { MaterialsStatus, QuoteTable } from '../panels/PricePanel'

/** The itemised price of the piece being edited, live with every panel edit. */
export function PiecePricePanel({ design }: { readonly design: CabinetDesign }): ReactElement {
  const t = useT()
  const priceDb = useAppStore((state) => state.priceDb)
  const quote = useMemo(
    () => (priceDb === null ? null : quoteForDesign(design, priceDb)),
    [design, priceDb]
  )

  return (
    <section className="panel panel--price">
      <h2 className="panel__title">{t('piecePrice.title')}</h2>
      <MaterialsStatus />
      {quote !== null && <QuoteTable quote={quote} />}
    </section>
  )
}
