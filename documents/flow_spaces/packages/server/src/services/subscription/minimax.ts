import type { SubscriptionConfig, SubscriptionQuota, SubscriptionLimit } from '@agent-spaces/shared'
import { SubscriptionProviderBase } from './base.js'

interface MiniMaxModelRemain {
  model_name: string
  current_interval_total_count: number
  current_interval_usage_count: number
  current_weekly_total_count: number
  current_weekly_usage_count: number
  remains_time: number
  start_time: number
  end_time: number
}

interface MiniMaxResponse {
  model_remains: MiniMaxModelRemain[]
  base_resp: { status_code: number; status_msg: string }
}

const ALLOWED_MODELS = ['MiniMax-M*', 'coding-plan-vlm', 'coding-plan-search']

export class MiniMaxSubscriptionProvider extends SubscriptionProviderBase {
  readonly provider = 'minimax' as const

  async fetchQuota(config: SubscriptionConfig): Promise<SubscriptionQuota> {
    // Auto-extract X-Group-Id from cookie if not in headers
    const groupId = config.headers?.['X-Group-Id'] ?? config.headers?.['x-group-id']
      ?? this.extractCookieValue(config.cookie, 'minimax_group_id_v2')

    const url = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://platform.minimaxi.com/',
        'Origin': 'https://platform.minimaxi.com',
        ...(groupId ? { 'X-Group-Id': groupId } : {}),
        ...(config.cookie ? { 'Cookie': config.cookie } : {}),
        ...(config.headers ?? {}),
      },
    })

    console.log(`[subscription:minimax] quota response: ${res.status} ${res.statusText}`)

    if (!res.ok) {
      throw new Error(`MiniMax API returned ${res.status}: ${res.statusText}`)
    }

    const json = await res.json() as MiniMaxResponse
    if (json.base_resp.status_code !== 0) {
      throw new Error(`MiniMax API error: ${json.base_resp.status_msg}`)
    }

    const limits: SubscriptionLimit[] = json.model_remains
      .filter(m => ALLOWED_MODELS.includes(m.model_name))
      .map(m => {
        const total = m.current_interval_total_count
        const used = m.current_interval_usage_count
        const remaining = total - used
        const percentage = total > 0 ? Math.round((used / total) * 100) : 0
        return {
          type: m.model_name,
          usage: used,
          currentValue: remaining,
          remaining,
          percentage,
          nextResetTime: m.end_time,
          usageDetails: [],
        }
      })

    return {
      provider: 'minimax',
      label: config.label,
      limits,
      fetchedAt: new Date().toISOString(),
    }
  }

  private extractCookieValue(cookie: string | undefined, name: string): string | undefined {
    if (!cookie) return undefined
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match?.[1]
  }
}
