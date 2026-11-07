import type { SubscriptionConfig, SubscriptionQuota } from '@agent-spaces/shared'
import { SubscriptionProviderBase } from './base.js'

interface ZhiPuQuotaResponse {
  code: number
  msg: string
  data: {
    limits: Array<{
      type: string
      unit?: number
      number?: number
      usage?: number
      currentValue?: number
      remaining?: number
      percentage?: number
      nextResetTime?: number
      usageDetails?: Array<{ modelCode: string; usage: number }>
    }>
    level: string
  }
  success: boolean
}

export class ZhiPuSubscriptionProvider extends SubscriptionProviderBase {
  readonly provider = 'zhipu' as const

  async fetchQuota(config: SubscriptionConfig): Promise<SubscriptionQuota> {
    const url = 'https://bigmodel.cn/api/monitor/usage/quota/limit'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Set-Language': 'zh',
        ...config.headers,
      },
    })

    if (!res.ok) {
      throw new Error(`ZhiPu API returned ${res.status}: ${res.statusText}`)
    }

    const json = await res.json() as ZhiPuQuotaResponse
    if (json.code !== 200 || !json.success) {
      throw new Error(`ZhiPu API error: ${json.msg}`)
    }

    return {
      provider: 'zhipu',
      label: config.label,
      limits: json.data.limits.map(l => ({
        type: l.type,
        unit: l.unit,
        number: l.number,
        usage: l.usage,
        currentValue: l.currentValue,
        remaining: l.remaining,
        percentage: l.percentage,
        nextResetTime: l.nextResetTime,
        usageDetails: l.usageDetails,
      })),
      fetchedAt: new Date().toISOString(),
    }
  }
}
