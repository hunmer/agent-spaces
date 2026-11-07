import type { SubscriptionConfig, SubscriptionQuota } from '@agent-spaces/shared'
import { SubscriptionProviderBase } from './base.js'

interface AiCodeResponse {
  success: boolean
  data: {
    balance: string
    bonusBalance: string
  }
}

export class AiCodeSubscriptionProvider extends SubscriptionProviderBase {
  readonly provider = 'aicode' as const

  async fetchQuota(config: SubscriptionConfig): Promise<SubscriptionQuota> {
    const url = 'https://www.aicodemirror.com/api/wallet'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'Referer': 'https://www.aicodemirror.com/dashboard/wallet',
        ...(config.cookie ? { 'Cookie': config.cookie } : {}),
        ...(config.headers ?? {}),
      },
    })

    if (!res.ok) {
      throw new Error(`AiCode API returned ${res.status}: ${res.statusText}`)
    }

    const json = await res.json() as AiCodeResponse
    if (!json.success) {
      throw new Error('AiCode API returned unsuccessful response')
    }

    const balance = Number(json.data.balance) / 1000
    const bonus = Number(json.data.bonusBalance) / 1000

    return {
      provider: 'aicode',
      label: config.label,
      limits: [
        {
          type: 'balance',
          currentValue: Math.round(balance * 100) / 100,
          remaining: Math.round(balance * 100) / 100,
          percentage: 0,
        },
        {
          type: 'bonusBalance',
          currentValue: Math.round(bonus * 100) / 100,
          remaining: Math.round(bonus * 100) / 100,
          percentage: 0,
        },
      ],
      fetchedAt: new Date().toISOString(),
    }
  }
}
