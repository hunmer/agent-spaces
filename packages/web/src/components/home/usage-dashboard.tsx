"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from 'next-intl'
import { Clock3, Cpu, DollarSign, Zap } from "lucide-react"
import { differenceInDays } from "date-fns"
import type { AgentUsageDashboard as AgentUsageDashboardData } from "@agent-spaces/shared"

import { Card } from "@/components/ui/card"
import { SubscriptionPanel } from "./subscription-panel"
import { sdk } from "@/lib/sdk"
import { formatCurrency, formatDuration, formatTokens, formatNumber, PERIOD_KEYS, type PeriodKey } from "./usage-dashboard-utils"
import { DashboardSkeleton } from "./usage-dashboard-skeleton"
import { PeriodSelector, Metric, ActivitySection, CostByModelChart, TokenPieChart, CostPieChart } from "./usage-dashboard-charts"
import { AgentRunsTable } from "./usage-dashboard-table"

export function UsageDashboard() {
  const t = useTranslations('home')
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>()
  const [data, setData] = useState<AgentUsageDashboardData | null>(null)

  const formatRelative = useCallback((value: string) => {
    const delta = Date.now() - new Date(value).getTime()
    if (!Number.isFinite(delta) || delta < 0) return t('time.justNow')
    const minutes = Math.floor(delta / 60_000)
    if (minutes < 1) return t('time.justNow')
    if (minutes < 60) return t('time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('time.hoursAgo', { n: hours })
    return t('time.daysAgo', { n: Math.floor(hours / 24) })
  }, [t])

  const fetchDays = useCallback(() => {
    if (period === 'custom' && customRange) {
      return differenceInDays(customRange.to, customRange.from) + 1
    }
    return PERIOD_KEYS.find(p => p.key === period)?.days ?? 30
  }, [period, customRange])

  useEffect(() => {
    const controller = new AbortController()
    const days = fetchDays()
    sdk.agent.usageDashboard(days)
      .then((d) => setData(d))
      .catch(() => setData(null))
    return () => controller.abort()
  }, [fetchDays])

  const handlePeriodChange = useCallback((key: PeriodKey, range?: { from: Date; to: Date }) => {
    setPeriod(key)
    setCustomRange(range)
  }, [])

  if (data === null) {
    return <DashboardSkeleton />
  }

  const totals = data.totals ?? {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    avgDurationMs: 0,
  }
  const daily = data.daily ?? []
  const byModel = data.byModel ?? []
  const maxDailyTokens = Math.max(1, ...daily.map((item) => item.totalTokens))
  const maxModelCost = Math.max(1, ...byModel.map((item) => item.costUsd))
  const days = fetchDays()

  return (
    <div className="col-span-full flex flex-col gap-3">
      {/* Header */}
      <Card className="gap-0 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-sm">{t('title')}</span>
          <PeriodSelector period={period} customRange={customRange} onPeriodChange={handlePeriodChange} />
        </div>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="gap-0 py-0">
          <Metric label={t('metric.agentRuns')} value={formatNumber(totals.requests)} helper={t('metric.agentRunsHelper')} icon={Zap} totalCostLabel={t('metric.totalCost')} />
        </Card>
        <Card className="gap-0 py-0">
          <Metric label={t('metric.tokensUsed')} value={formatTokens(totals.totalTokens)} helper={`${formatTokens(totals.inputTokens)} ${t('metric.tokensIn')}`} icon={Cpu} totalCostLabel={t('metric.totalCost')} />
        </Card>
        <Card className="gap-0 py-0">
          <Metric label={t('metric.totalCost')} value={formatCurrency(totals.totalCostUsd)} helper={t('metric.totalCostHelper')} icon={DollarSign} totalCostLabel={t('metric.totalCost')} />
        </Card>
        <Card className="gap-0 py-0">
          <Metric label={t('metric.avgDuration')} value={formatDuration(totals.avgDurationMs)} helper={t('metric.avgDurationHelper')} icon={Clock3} totalCostLabel={t('metric.totalCost')} />
        </Card>
      </div>

      {/* Activity */}
      <ActivitySection daily={daily} days={days} maxDailyTokens={maxDailyTokens} />

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="gap-0 py-0">
          <CostByModelChart byModel={byModel} maxModelCost={maxModelCost} />
        </Card>
        <Card className="gap-0 py-0">
          <div className="p-4">
            <span className="font-medium text-xs">{t('chart.tokenDistribution')}</span>
            <TokenPieChart inputTokens={totals.inputTokens} outputTokens={totals.outputTokens} />
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="p-4">
            <span className="font-medium text-xs">{t('chart.costDistribution')}</span>
            <CostPieChart byModel={byModel} totalCost={totals.totalCostUsd} />
          </div>
        </Card>
      </div>

      {/* Subscription */}
      <Card className="px-4 py-3">
        <SubscriptionPanel />
      </Card>

      {/* Recent Runs */}
      <Card className="gap-0 overflow-hidden py-0">
        <AgentRunsTable days={days} formatRelative={formatRelative} />
      </Card>
    </div>
  )
}
