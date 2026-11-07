export type SubscriptionProvider = 'zhipu' | 'minimax' | 'aicode'

export interface SubscriptionConfig {
  id: string
  provider: SubscriptionProvider
  label: string
  headers?: Record<string, string>
  cookie?: string
  createdAt: string
  updatedAt: string
}

export interface SubscriptionQuota {
  provider: SubscriptionProvider
  label: string
  limits: SubscriptionLimit[]
  fetchedAt: string
}

export interface SubscriptionLimit {
  type: string
  usage?: number
  currentValue?: number
  remaining?: number
  percentage?: number
  nextResetTime?: number
  unit?: number
  number?: number
  usageDetails?: Array<{ modelCode: string; usage: number }>
}
