"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowDown, ArrowUp, ChevronLeftIcon, ChevronRightIcon, Clock3, Cpu, DollarSign, TrendingUp, Zap, type LucideIcon } from "lucide-react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table"
import type { AgentUsageDashboard as AgentUsageDashboardData, AgentUsageRecord } from "@agent-spaces/shared"
import { Label, Pie, PieChart } from "recharts"

import { differenceInDays, subDays } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePagination } from "@/hooks/use-pagination"
import { cn, textColorClass, textToColor } from "@/lib/utils"

// ── model -> provider icon mapping ──

const MODEL_ICON_MAP: Array<[RegExp, string]> = [
  [/claude/i, 'anthropic'],
  [/gpt|o1-|o3-|o4-|chatgpt/i, 'openai'],
  [/gemini/i, 'gemini'],
  [/deepseek/i, 'deepseek'],
  [/qwen/i, 'alibaba'],
  [/glm|chatglm/i, 'zhipu'],
  [/moonshot|kimi/i, 'kimi'],
  [/doubao/i, 'doubao'],
  [/llama/i, 'meta'],
  [/mistral/i, 'mistral'],
  [/codestral/i, 'mistral'],
]

function getModelIconUrl(model?: string): string {
  if (!model) return ''
  for (const [re, icon] of MODEL_ICON_MAP) {
    if (re.test(model)) return `/static/provider-icons/${icon}.svg`
  }
  return ''
}

// ── table columns ──

const columns: ColumnDef<AgentUsageRecord>[] = [
  {
    accessorKey: 'role',
    header: 'Agent',
    cell: ({ row }) => {
      const { role, runtime } = row.original
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-xs capitalize">{role}</span>
          {runtime && <span className="text-muted-foreground text-[10px]">{runtime}</span>}
        </div>
      )
    }
  },
  {
    accessorKey: 'model',
    header: 'Model',
    cell: ({ row }) => {
      const model = row.original.model
      const iconUrl = getModelIconUrl(model)
      return (
        <div className="flex items-center gap-2">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="size-4 shrink-0 rounded-sm" />
          ) : (
            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold", textColorClass(model ?? '?'))}>
              {model?.charAt(0).toUpperCase() ?? '?'}
            </span>
          )}
          <span className="truncate text-xs max-w-40">{model || 'unknown'}</span>
        </div>
      )
    }
  },
  {
    accessorKey: 'summary',
    header: 'Summary',
    cell: ({ row }) => (
      <span className="line-clamp-2 text-xs text-muted-foreground max-w-64">
        {row.original.summary || '—'}
      </span>
    )
  },
  {
    accessorKey: 'totalCostUsd',
    header: 'Cost',
    cell: ({ row }) => {
      const { inputCostUsd, outputCostUsd, totalCostUsd } = row.original
      return (
        <div className="flex flex-col gap-0.5 font-mono text-xs tabular-nums">
          <span>{formatCurrency(totalCostUsd)}</span>
          <Tooltip>
            <TooltipTrigger render={<span className="text-muted-foreground text-[10px] cursor-default" />}>
                {formatTokens(row.original.inputTokens)} in / {formatTokens(row.original.outputTokens)} out
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Total: {formatTokens(row.original.totalTokens)} · Cache hit: {row.original.inputTokens > 0 ? Math.round((row.original.cachedInputTokens / row.original.inputTokens) * 100) : 0}%
            </TooltipContent>
          </Tooltip>
        </div>
      )
    }
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status
      const colorMap: Record<string, string> = {
        completed: 'bg-emerald-500/10 text-emerald-600',
        active: 'bg-blue-500/10 text-blue-600',
        idle: 'bg-muted text-muted-foreground',
        blocked: 'bg-amber-500/10 text-amber-600',
        crashed: 'bg-red-500/10 text-red-600',
      }
      return (
        <Badge className={cn('rounded-sm px-1.5 text-[10px] capitalize', colorMap[status] ?? 'bg-muted text-muted-foreground')}>
          {status}
        </Badge>
      )
    }
  },
  {
    accessorKey: 'durationMs',
    header: 'Duration',
    cell: ({ row }) => {
      const { startedAt, completedAt } = row.original
      const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
      return <span className="font-mono text-xs tabular-nums">{formatDuration(Number.isFinite(ms) && ms > 0 ? ms : 0)}</span>
    }
  },
  {
    accessorKey: 'completedAt',
    header: 'Time',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs">{formatRelative(row.original.completedAt)}</span>
    )
  },
]

// ── period types ──

type PeriodKey = 'today' | '7d' | '30d' | '1y' | 'custom'

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; days: number }> = [
  { key: 'today', label: '今日', days: 1 },
  { key: '7d', label: '7 天', days: 7 },
  { key: '30d', label: '30 天', days: 30 },
  { key: '1y', label: '1 年', days: 365 },
]

// ── main component ──

export function UsageDashboard() {
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>()
  const [data, setData] = useState<AgentUsageDashboardData | null>(null)

  const fetchDays = useCallback(() => {
    if (period === 'custom' && customRange) {
      return differenceInDays(customRange.to, customRange.from) + 1
    }
    return PERIOD_OPTIONS.find(p => p.key === period)?.days ?? 30
  }, [period, customRange])

  useEffect(() => {
    const controller = new AbortController()
    const days = fetchDays()
    fetch(`/api/agents/usage/dashboard?days=${days}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
    return () => controller.abort()
  }, [fetchDays])

  const totals = data?.totals ?? {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    avgDurationMs: 0,
  }
  const daily = data?.daily ?? []
  const byModel = data?.byModel ?? []
  const recent = data?.recent ?? []
  const maxDailyTokens = Math.max(1, ...daily.map((item) => item.totalTokens))
  const maxModelCost = Math.max(1, ...byModel.map((item) => item.costUsd))

  return (
    <Card className="col-span-full gap-0 overflow-hidden rounded-lg py-0">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="font-medium text-sm">Agent Usage</span>
        <div className="flex items-center gap-1">
          {PERIOD_OPTIONS.map(opt => (
            <Badge
              key={opt.key}
              variant={period === opt.key ? 'default' : 'secondary'}
              className="h-5 cursor-pointer rounded-full font-normal text-[10px] transition-colors"
              onClick={() => { setPeriod(opt.key); setCustomRange(undefined) }}
            >
              {opt.label}
            </Badge>
          ))}
          <Popover>
            <PopoverTrigger nativeButton={false} render={
              <Badge
                variant={period === 'custom' ? 'default' : 'secondary'}
                className="h-5 cursor-pointer rounded-full font-normal text-[10px] transition-colors"
              >
                自定义
              </Badge>
            } />
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={customRange?.from ?? subDays(new Date(), 30)}
                selected={customRange ? { from: customRange.from, to: customRange.to } : undefined}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setCustomRange({ from: range.from, to: range.to })
                    setPeriod('custom')
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4">
        <Metric label="Agent Runs" value={formatNumber(totals.requests)} helper="completed runs" icon={Zap} />
        <Metric label="Tokens Used" value={formatTokens(totals.totalTokens)} helper={`${formatTokens(totals.inputTokens)} in`} icon={Cpu} />
        <Metric label="Total Cost" value={formatCurrency(totals.totalCostUsd)} helper="estimated spend" icon={DollarSign} />
        <Metric label="Avg Duration" value={formatDuration(totals.avgDurationMs)} helper="per run" icon={Clock3} last />
      </div>

      <div className="grid border-b lg:grid-cols-3">
        <div className="border-b p-4 lg:col-span-2 lg:border-r lg:border-b-0">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium text-xs">Daily Token Usage</span>
            <div className="flex items-center gap-3">
              <Legend className="bg-foreground" label="Input" />
              <Legend className="bg-foreground/40" label="Output" />
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
            {daily.length === 0 ? <EmptyBars /> : null}
          </div>
        </div>

        <div className="p-4">
          <span className="font-medium text-xs">Cost by Model</span>
          <div className="mt-3 space-y-2.5">
            {byModel.length === 0 ? (
              <p className="text-muted-foreground text-xs">No completed usage records yet.</p>
            ) : byModel.map((item, index) => (
              <div key={item.model} className="rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => { const iconUrl = getModelIconUrl(item.model); return iconUrl ? (
                      <img src={iconUrl} alt="" className="size-4 shrink-0 rounded-sm" />
                    ) : (
                      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-semibold", textColorClass(item.model ?? '?'))}>
                        {item.model?.charAt(0).toUpperCase() ?? '?'}
                      </span>
                    )})()}
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
      </div>

      <div className="grid border-b lg:grid-cols-2">
        <div className="border-b p-4 lg:border-r lg:border-b-0">
          <span className="font-medium text-xs">Token Distribution</span>
          <TokenPieChart inputTokens={totals.inputTokens} outputTokens={totals.outputTokens} />
        </div>
        <div className="p-4">
          <span className="font-medium text-xs">Cost Distribution</span>
          <CostPieChart byModel={byModel} totalCost={totals.totalCostUsd} />
        </div>
      </div>

      <AgentRunsTable data={recent} />
    </Card>
  )
}

// ── agent runs datatable ──

function AgentRunsTable({ data }: { data: AgentUsageRecord[] }) {
  const pageSize = 5
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    state: { pagination }
  })

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay: 2
  })

  if (data.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        Usage appears here after an agent run completes.
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="border-b">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id}>
                {hg.headers.map(header => (
                  <TableHead key={header.id} className="text-muted-foreground h-10 first:pl-4">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="first:pl-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-3 max-sm:flex-col md:max-lg:flex-col">
        <p className="text-muted-foreground text-sm whitespace-nowrap" aria-live="polite">
          Showing{' '}
          <span>
            {table.getState().pagination.pageIndex * pageSize + 1} to{' '}
            {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getRowCount())}
          </span>{' '}
          of <span>{table.getRowCount()}</span> entries
        </p>
        <Pagination className="mx-0 ml-auto w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button
                className="disabled:pointer-events-none disabled:opacity-50"
                variant="ghost"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Go to previous page"
              >
                <ChevronLeftIcon aria-hidden="true" />
                Previous
              </Button>
            </PaginationItem>
            {showLeftEllipsis && (
              <PaginationItem><PaginationEllipsis /></PaginationItem>
            )}
            {pages.map(page => {
              const isActive = page === table.getState().pagination.pageIndex + 1
              return (
                <PaginationItem key={page}>
                  <Button
                    size="icon"
                    className={cn(!isActive && 'bg-primary/10 text-primary hover:bg-primary/20')}
                    onClick={() => table.setPageIndex(page - 1)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {page}
                  </Button>
                </PaginationItem>
              )
            })}
            {showRightEllipsis && (
              <PaginationItem><PaginationEllipsis /></PaginationItem>
            )}
            <PaginationItem>
              <Button
                className="disabled:pointer-events-none disabled:opacity-50"
                variant="ghost"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Go to next page"
              >
                Next
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

// ── sub-components ──

function Metric({ label, value, helper, icon: Icon, last }: { label: string; value: string; helper: string; icon: LucideIcon; last?: boolean }) {
  return (
    <div className={cn("px-4 py-3", !last && "border-r")}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div className="mt-1 font-semibold text-2xl tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-1">
        {label === "Total Cost" ? <ArrowDown className="size-3 text-emerald-500" /> : <ArrowUp className="size-3 text-emerald-500" />}
        <span className="text-muted-foreground text-[10px]">{helper}</span>
      </div>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className={cn("size-2 rounded-sm", className)} />
      {label}
    </span>
  )
}

// ── pie charts ──

const tokenPieConfig = {
  input: { label: "Input", color: "var(--primary)" },
  output: { label: "Output", color: "color-mix(in oklab, var(--primary) 40%, transparent)" },
} satisfies ChartConfig

function TokenPieChart({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) {
  const total = inputTokens + outputTokens
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
                        tokens
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
        <Legend className="bg-primary" label={`Input ${total ? Math.round((inputTokens / total) * 100) : 0}%`} />
        <Legend className="bg-primary/40" label={`Output ${total ? Math.round((outputTokens / total) * 100) : 0}%`} />
      </div>
    </div>
  )
}

function CostPieChart({ byModel, totalCost }: { byModel: Array<{ model: string; costUsd: number }>; totalCost: number }) {
  if (byModel.length === 0) {
    return <p className="mt-4 text-center text-xs text-muted-foreground">No cost data yet.</p>
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
                        total cost
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

function EmptyBars() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
      No token data
    </div>
  )
}

// ── formatters ──

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return formatNumber(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value)
}

function formatDuration(value: number) {
  if (!value) return "0ms"
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value / 60_000)}m`
}

function formatRelative(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta) || delta < 0) return "just now"
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
