export type PeriodKey = 'today' | '7d' | '30d' | '1y' | 'custom'

export const PERIOD_KEYS: Array<{ key: PeriodKey; days: number }> = [
  { key: 'today', days: 1 },
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '1y', days: 365 },
]

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return formatNumber(value)
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value)
}

export function formatDuration(value: number) {
  if (!value) return "0ms"
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value / 60_000)}m`
}
