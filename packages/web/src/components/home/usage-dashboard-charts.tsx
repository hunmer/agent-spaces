"use client"

import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react"
import { subDays } from "date-fns"
import { Label, Pie, PieChart } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card } from "@/components/ui/card"
import { ModelProviderIcon } from "@/components/common/model-provider-icon"
import { cn, textColorClass, textToColor } from "@/lib/utils"
import { ActivityGraph } from "@/components/viewers/activity-graph"
import type { AgentUsageDashboard as AgentUsageDashboardData } from "@agent-spaces/shared"
import { formatCurrency, formatNumber, formatTokens, PERIOD_KEYS, type PeriodKey } from "./usage-dashboard-utils"

function isDateRange(value: unknown): value is { from: Date; to: Date } {
  return Boolean(
    value
    && typeof value === "object"
    && (value as { from?: unknown }).from instanceof Date
    && (value as { to?: unknown }).to instanceof Date,
  )
}

// ── period selector ──

export function PeriodSelector({ period, customRange, onPeriodChange }: {
  period: PeriodKey
  customRange?: { from: Date; to: Date }
  onPeriodChange: (key: PeriodKey, range?: { from: Date; to: Date }) => void
}) {
  const t = useTranslations('home')

  return (
    <div className="flex items-center gap-1">
      {PERIOD_KEYS.map(opt => (
        <Badge
          key={opt.key}
          variant={period === opt.key ? 'default' : 'secondary'}
          className="h-5 cursor-pointer rounded-full font-normal text-[10px] transition-colors"
          onClick={() => onPeriodChange(opt.key)}
        >
          {t(`period.${opt.key === '7d' ? '7d' : opt.key === '30d' ? '30d' : opt.key === '1y' ? '1y' : opt.key}`)}
        </Badge>
      ))}
      <Popover>
        <PopoverTrigger nativeButton={false} render={
          <Badge
            variant={period === 'custom' ? 'default' : 'secondary'}
            className="h-5 cursor-pointer rounded-full font-normal text-[10px] transition-colors"
          >
            {t('period.custom')}
          </Badge>
        } />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={customRange?.from ?? subDays(new Date(), 30)}
            selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
            onSelect={(range) => {
              if (isDateRange(range)) {
                onPeriodChange('custom', { from: range.from, to: range.to })
              }
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── metric card ──

export function Metric({ label, value, helper, icon: Icon, last, totalCostLabel }: { label: string; value: string; helper: string; icon: LucideIcon; last?: boolean; totalCostLabel: string }) {
  return (
    <div className={cn("px-4 py-3", !last && "border-r")}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="mt-1 font-semibold text-2xl tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-1">
        {label === totalCostLabel ? <ArrowDown className="size-3 text-emerald-500" /> : <ArrowUp className="size-3 text-emerald-500" />}
        <span className="text-muted-foreground text-[10px]">{helper}</span>
      </div>
    </div>
  )
}

// ── legend ──

export function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className={cn("size-2 rounded-sm", className)} />
      {label}
    </span>
  )
}

// ── empty bars ──

export function EmptyBars({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
      {label}
    </div>
  )
}

// ── activity + daily token chart ──

export function ActivitySection({ daily, days, maxDailyTokens }: {
  daily: AgentUsageDashboardData['daily']
  days: number
  maxDailyTokens: number
}) {
  const t = useTranslations('home')

  const weeks = Math.max(1, Math.ceil(days / 7))

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {daily.length > 0 && (
        <Card className="gap-0 py-0">
          <div className="p-4">
            <span className="font-medium text-xs">{t('chart.activityHeatmap')}</span>
            <div className="mt-2">
              <ActivityGraph
                weeks={weeks}
                data={daily.map((item) => ({ date: item.date, count: item.requests }))}
                formatCount={(count) => `${formatNumber(count)} session${count === 1 ? "" : "s"}`}
              />
            </div>
          </div>
        </Card>
      )}
      <Card className="gap-0 py-0">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium text-xs">{t('chart.dailyTokenUsage')}</span>
            <div className="flex items-center gap-3">
              <Legend className="bg-foreground" label={t('chart.input')} />
              <Legend className="bg-foreground/40" label={t('chart.output')} />
            </div>
          </div>
          <div className="flex h-[132px] items-end gap-2 sm:gap-3">
            {daily.slice(-14).map((item) => {
              const inputHeight = Math.max(3, ((item.inputTokens / maxDailyTokens) * 100))
              const outputHeight = Math.max(3, (((item.inputTokens + item.outputTokens) / maxDailyTokens) * 100))
              return (
                <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatTokens(item.totalTokens)}
                  </span>
                  <div className="relative h-20 w-full">
                    <div className="absolute inset-x-0 bottom-0 h-full rounded-sm bg-muted/40" />
                    <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-foreground/40" style={{ height: `${outputHeight}%` }} />
                    <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-foreground" style={{ height: `${inputHeight}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{item.label}</span>
                </div>
              )
            })}
            {daily.length === 0 ? <EmptyBars label={t('chart.noTokenData')} /> : null}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── cost by model ranking ──

export function CostByModelChart({ byModel, maxModelCost }: {
  byModel: AgentUsageDashboardData['byModel']
  maxModelCost: number
}) {
  const t = useTranslations('home')

  return (
    <div className="p-4">
      <span className="font-medium text-xs">{t('chart.costByModel')}</span>
      <div className="mt-3 space-y-2.5">
        {byModel.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('chart.noUsageRecords')}</p>
        ) : byModel.map((item, index) => (
          <div key={item.model} className="rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <ModelProviderIcon modelId={item.model} fallbackClassName={cn(textColorClass(item.model ?? '?'))} />
                <span className="truncate text-xs">{item.model}</span>
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums">{formatCurrency(item.costUsd)}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", index === 0 ? "bg-foreground" : "bg-foreground/60")}
                style={{ width: `${Math.max(4, (item.costUsd / maxModelCost) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── token pie chart ──

export function TokenPieChart({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) {
  const t = useTranslations('home')
  const total = inputTokens + outputTokens
  const tokenPieConfig = {
    input: { label: t('chart.input'), color: "var(--primary)" },
    output: { label: t('chart.output'), color: "color-mix(in oklab, var(--primary) 40%, transparent)" },
  } satisfies ChartConfig
  const data = [
    { key: "input", value: inputTokens, fill: "var(--color-input)" },
    { key: "output", value: outputTokens, fill: "var(--color-output)" },
  ]
  return (
    <div className="mt-2">
      <ChartContainer config={tokenPieConfig} className="mx-auto h-40 w-full">
        <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="key" startAngle={90} endAngle={450} innerRadius={48} outerRadius={68} paddingAngle={2}>
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) - 8} className="fill-card-foreground text-sm font-medium">
                        {formatTokens(total)}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 10} className="fill-muted-foreground text-[10px]">
                        {t('chart.tokens')}
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex items-center justify-center gap-4">
        <Legend className="bg-primary" label={`${t('chart.input')} ${total ? Math.round((inputTokens / total) * 100) : 0}%`} />
        <Legend className="bg-primary/40" label={`${t('chart.output')} ${total ? Math.round((outputTokens / total) * 100) : 0}%`} />
      </div>
    </div>
  )
}

// ── cost pie chart ──

export function CostPieChart({ byModel, totalCost }: { byModel: AgentUsageDashboardData['byModel']; totalCost: number }) {
  const t = useTranslations('home')
  if (byModel.length === 0) {
    return <p className="mt-4 text-center text-xs text-muted-foreground">{t('chart.noCostData')}</p>
  }
  const top = byModel.slice(0, 5)
  const data = top.map((item) => ({ key: item.model, value: item.costUsd, fill: textToColor(item.model) }))
  const costPieConfig = Object.fromEntries(
    top.map((item) => [item.model, { label: item.model, color: textToColor(item.model) }])
  ) satisfies ChartConfig
  return (
    <div className="mt-2">
      <ChartContainer config={costPieConfig} className="mx-auto h-40 w-full">
        <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="key" startAngle={90} endAngle={450} innerRadius={48} outerRadius={68} paddingAngle={2}>
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) - 8} className="fill-card-foreground text-sm font-medium">
                        {formatCurrency(totalCost)}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 10} className="fill-muted-foreground text-[10px]">
                        {t('chart.totalCost')}
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="mt-1 space-y-0.5">
        {top.map((item) => (
          <div key={item.model} className="flex items-center justify-between px-1">
            <span className="truncate text-[10px]">{item.model}</span>
            <span className="font-mono text-[10px] tabular-nums">{formatCurrency(item.costUsd)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
