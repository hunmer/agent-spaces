"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from 'next-intl'
import { RefreshCw } from "lucide-react"
import type { SubscriptionConfig, SubscriptionLimit, SubscriptionQuota } from "@agent-spaces/shared"

import { Button } from "@/components/ui/button"
import { SubscriptionDialog } from "./subscription-dialog"

const LIMIT_TYPE_LABELS: Record<string, string> = {
  TIME_LIMIT: '时间额度',
  TOKENS_LIMIT: 'Token 额度',
  'MiniMax-M*': 'MiniMax-M*',
  'coding-plan-vlm': 'Coding Plan VLM',
  'coding-plan-search': 'Coding Plan Search',
}

function formatLimitValue(limit: SubscriptionLimit): string | null {
  if (limit.type === 'TIME_LIMIT') {
    if (limit.currentValue !== undefined && limit.usage !== undefined) {
      return `${limit.currentValue} / ${limit.usage}`
    }
    if (limit.percentage !== undefined) {
      return `${limit.percentage}%`
    }
  }
  if (limit.remaining !== undefined && limit.usage !== undefined) {
    const total = limit.remaining + limit.usage
    return `${limit.remaining} / ${total}`
  }
  return null
}

export function SubscriptionPanel() {
  const t = useTranslations('home')
  const [configs, setConfigs] = useState<SubscriptionConfig[]>([])
  const [quotas, setQuotas] = useState<Map<string, SubscriptionQuota>>(new Map())
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadConfigs = useCallback(async () => {
    const res = await fetch('/api/subscriptions')
    if (res.ok) setConfigs(await res.json())
  }, [])

  const fetchAllQuotas = useCallback(async (items: SubscriptionConfig[]) => {
    setLoading(true)
    const map = new Map<string, SubscriptionQuota>()
    await Promise.allSettled(
      items.map(async item => {
        try {
          const res = await fetch(`/api/subscriptions/${item.id}/quota`)
          if (res.ok) map.set(item.id, await res.json())
        } catch {}
      })
    )
    setQuotas(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs, refreshKey])

  useEffect(() => {
    if (configs.length > 0) fetchAllQuotas(configs)
  }, [configs, fetchAllQuotas])

  const handleChanged = () => setRefreshKey(k => k + 1)

  if (configs.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <span className="font-medium text-xs">{t('subscription.planTitle')}</span>
        <SubscriptionDialog onChange={handleChanged} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-xs">{t('subscription.planTitle')}</span>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => fetchAllQuotas(configs)} disabled={loading}>
            <RefreshCw className={`size-3 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <SubscriptionDialog onChange={handleChanged} />
        </div>
      </div>

      {configs.map(config => {
        const quota = quotas.get(config.id)
        if (!quota) return (
          <div key={config.id} className="rounded-md border px-3 py-2">
            <span className="text-xs text-muted-foreground">{config.label} - {t('subscription.loading')}</span>
          </div>
        )

        return (
          <div key={config.id} className="space-y-2 rounded-md border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{config.label}</span>
              <span className="text-[10px] text-muted-foreground capitalize">({config.provider})</span>
            </div>
            {quota.limits.map((limit, i) => {
              const displayValue = formatLimitValue(limit)
              const pct = limit.percentage
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {LIMIT_TYPE_LABELS[limit.type] || limit.type}
                    </span>
                    {displayValue && (
                      <span className="font-mono text-[11px] tabular-nums">{displayValue}</span>
                    )}
                  </div>
                  {pct !== undefined && (
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}
                  {limit.usageDetails && limit.usageDetails.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-2">
                      {limit.usageDetails.map(d => (
                        <span key={d.modelCode} className="text-[10px] text-muted-foreground">
                          {d.modelCode}: {d.usage}
                        </span>
                      ))}
                    </div>
                  )}
                  {limit.nextResetTime && (
                    <span className="text-[10px] text-muted-foreground">
                      {t('subscription.resetAt')} {new Date(limit.nextResetTime).toLocaleString()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
