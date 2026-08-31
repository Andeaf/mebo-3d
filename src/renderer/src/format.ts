const eurFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })
const quantityFormatter = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 })

export function formatEur(value: number): string {
  return eurFormatter.format(value)
}

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value)
}
