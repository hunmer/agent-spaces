"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from 'next-intl'
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table"
import type { AgentUsageRecord } from "@agent-spaces/shared"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePagination } from "@/hooks/use-pagination"
import { cn, textColorClass } from "@/lib/utils"
import { sdk } from "@/lib/sdk"
import { SessionDetailButton, UsageDashboardSessionDialog } from "./usage-dashboard-session-dialog"
import { formatCurrency, formatDuration, formatTokens, getModelIconUrl } from "./usage-dashboard-utils"
import { FilterPanel } from "@/components/table/filter-panel"
import type { Filter, FilterFieldConfig, CustomRendererProps } from "@/components/reui/filters"

const PAGE_SIZE = 5

export function AgentRunsTable({ days, formatRelative }: { days: number; formatRelative: (v: string) => string }) {
  const t = useTranslations('home')
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })
  const [selectedRecord, setSelectedRecord] = useState<AgentUsageRecord | null>(null)
  const [filters, setFilters] = useState<Filter[]>([])
  const [records, setRecords] = useState<AgentUsageRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 过滤选项（model/status/role/runtime 来自后端去重）
  const [options, setOptions] = useState<{ models: string[]; statuses: string[]; roles: string[]; runtimes: string[] }>({ models: [], statuses: [], roles: [], runtimes: [] })

  // 拉取过滤选项（days 变化时刷新）
  useEffect(() => {
    let alive = true
    sdk.agent.usageOptions(days)
      .then((o) => { if (alive) setOptions(o) })
      .catch(() => { /* 选项失败不阻塞，静默 */ })
    return () => { alive = false }
  }, [days])

  const filterFields = useMemo<FilterFieldConfig[]>(() => [
    {
      key: 'model',
      label: t('table.model'),
      type: 'multiselect',
      options: options.models.map(m => ({ value: m, label: m })),
      defaultOperator: 'is_any_of',
    },
    {
      key: 'status',
      label: t('table.status'),
      type: 'multiselect',
      options: options.statuses.map(s => ({ value: s, label: s })),
      defaultOperator: 'is_any_of',
    },
    {
      key: 'role',
      label: t('table.agent'),
      type: 'multiselect',
      options: options.roles.map(a => ({ value: a, label: a })),
      defaultOperator: 'is_any_of',
    },
    {
      key: 'summary',
      label: t('table.summary'),
      type: 'text',
      operators: [
        { value: 'contains', label: t('filter.contains') },
        { value: 'not_contains', label: t('filter.notContains') },
        { value: 'is', label: t('filter.is') },
        { value: 'is_not', label: t('filter.isNot') },
        { value: 'empty', label: t('filter.empty') },
        { value: 'not_empty', label: t('filter.notEmpty') },
      ],
      defaultOperator: 'contains',
      placeholder: t('filter.searchSummary'),
    },
    {
      key: 'totalCostUsd',
      label: t('table.cost'),
      type: 'custom',
      operators: [
        { value: 'greater_than', label: t('filter.greaterThan') },
        { value: 'less_than', label: t('filter.lessThan') },
        { value: 'between', label: t('filter.between') },
      ],
      defaultOperator: 'greater_than',
      customRenderer: (props: CustomRendererProps) => (
        <NumberRangeInput values={props.values as (string | number)[]} onChange={props.onChange as (v: (string | number)[]) => void} operator={props.operator} placeholder={t('filter.costPlaceholder')} />
      ),
    },
    {
      key: 'durationMs',
      label: t('table.duration'),
      type: 'custom',
      operators: [
        { value: 'greater_than', label: t('filter.greaterThan') },
        { value: 'less_than', label: t('filter.lessThan') },
        { value: 'between', label: t('filter.between') },
      ],
      defaultOperator: 'greater_than',
      customRenderer: (props: CustomRendererProps) => (
        <NumberRangeInput values={props.values as (string | number)[]} onChange={props.onChange as (v: (string | number)[]) => void} operator={props.operator} placeholder={t('filter.durationPlaceholder')} suffix={t('filter.ms')} />
      ),
    },
    {
      key: 'completedAt',
      label: t('table.time'),
      type: 'custom',
      operators: [
        { value: 'between', label: t('filter.between') },
        { value: 'greater_than', label: t('filter.after') },
        { value: 'less_than', label: t('filter.before') },
      ],
      defaultOperator: 'between',
      customRenderer: (props: CustomRendererProps) => (
        <DateRangeInput values={props.values as (string | number)[]} onChange={props.onChange as (v: (string | number)[]) => void} operator={props.operator} />
      ),
    },
  ], [options, t])

  // 前端 Filter[] → 后端 UsageFilter[]（数值字段归一为 number）
  const toUsageFilters = useCallback((fs: Filter[]) => fs.map(f => {
    const isNumericField = f.field === 'totalCostUsd' || f.field === 'durationMs'
    return {
      id: f.id,
      field: f.field,
      operator: f.operator,
      values: f.values.map(v => (isNumericField && v !== '' && v !== undefined && v !== null ? Number(v) : v)),
    }
  }), [])

  // 防抖拉取：filters / page / days 变化时请求后端
  const reqSeq = useRef(0)
  useEffect(() => {
    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      sdk.agent.recentUsage({
        days,
        filters: toUsageFilters(filters),
        page: pagination.pageIndex + 1,
        pageSize: PAGE_SIZE,
      })
        .then((r) => {
          if (seq !== reqSeq.current) return
          setRecords(r.records)
          setTotal(r.total)
        })
        .catch((e) => {
          if (seq !== reqSeq.current) return
          setError(e instanceof Error ? e.message : t('filter.error'))
          setRecords([])
          setTotal(0)
        })
        .finally(() => { if (seq === reqSeq.current) setLoading(false) })
    }, 250)
    return () => clearTimeout(timer)
  }, [days, filters, pagination.pageIndex, toUsageFilters, t])

  const handleFiltersChange = useCallback((next: Filter[]) => {
    setFilters(next)
    setPagination(p => ({ ...p, pageIndex: 0 })) // 过滤变化回到首页
  }, [])

  const columns = useTableColumns(t, formatRelative)

  const table = useReactTable({
    data: records,
    columns,
    manualPagination: true, // 分页由后端控制
    pageCount: Math.ceil(total / PAGE_SIZE),
    meta: {
      onViewDetail: (record: AgentUsageRecord) => setSelectedRecord(record),
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    state: { pagination }
  })

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: pagination.pageIndex + 1,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    paginationItemsToDisplay: 2
  })

  if (loading && records.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        {t('filter.loading')}
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 px-4 py-2">
        <FilterPanel
          fields={filterFields}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClear={() => handleFiltersChange([])}
          clearLabel={t('filter.clear')}
        />
      </div>
      <div>
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
            {error ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-destructive text-xs">
                  {error}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
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
                  {t('table.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-3 max-sm:flex-col md:max-lg:flex-col">
        <p className="text-muted-foreground text-sm whitespace-nowrap" aria-live="polite">
          {t('pagination.showing')}{' '}
          <span>
            {total === 0 ? 0 : pagination.pageIndex * PAGE_SIZE + 1} {t('pagination.to')}{' '}
            {Math.min((pagination.pageIndex + 1) * PAGE_SIZE, total)}
          </span>{' '}
          {t('pagination.of')} <span>{total}</span> {t('pagination.entries')}
        </p>
        <Pagination className="mx-0 ml-auto w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button
                className="disabled:pointer-events-none disabled:opacity-50"
                variant="ghost"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label={t('pagination.prevAriaLabel')}
              >
                <ChevronLeftIcon aria-hidden="true" />
                {t('pagination.previous')}
              </Button>
            </PaginationItem>
            {showLeftEllipsis && (
              <PaginationItem><PaginationEllipsis /></PaginationItem>
            )}
            {pages.map(page => {
              const isActive = page === pagination.pageIndex + 1
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
                aria-label={t('pagination.nextAriaLabel')}
              >
                {t('pagination.next')}
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
      <UsageDashboardSessionDialog
        record={selectedRecord}
        open={Boolean(selectedRecord)}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null)
        }}
      />
    </div>
  )
}

// 数值范围输入：greater_than/less_than 单输入；between 双输入
function NumberRangeInput({ values, onChange, operator, placeholder, suffix }: {
  values: (number | string)[]
  onChange: (values: (number | string)[]) => void
  operator: string
  placeholder?: string
  suffix?: string
}) {
  if (operator === 'between') {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="h-8 w-20 text-xs"
          placeholder="min"
          value={values[0] ?? ''}
          onChange={(e) => onChange([e.target.value, values[1] ?? ''])}
        />
        <span className="text-muted-foreground text-[10px]">~</span>
        <Input
          type="number"
          className="h-8 w-20 text-xs"
          placeholder="max"
          value={values[1] ?? ''}
          onChange={(e) => onChange([values[0] ?? '', e.target.value])}
        />
        {suffix && <span className="text-muted-foreground text-[10px]">{suffix}</span>}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        className="h-8 w-24 text-xs"
        placeholder={placeholder}
        value={values[0] ?? ''}
        onChange={(e) => onChange([e.target.value])}
      />
      {suffix && <span className="text-muted-foreground text-[10px]">{suffix}</span>}
    </div>
  )
}

// 日期范围输入：between 双 date；greater_than(之后)/less_than(之前) 单 date
function DateRangeInput({ values, onChange, operator }: {
  values: (string | number)[]
  onChange: (values: (string | number)[]) => void
  operator: string
}) {
  const toDateInput = (v: string | number | undefined) => {
    if (!v) return ''
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  }
  const fromDateInput = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : '')

  if (operator === 'between') {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={toDateInput(values[0])}
          onChange={(e) => onChange([fromDateInput(e.target.value), values[1] ?? ''])}
        />
        <span className="text-muted-foreground text-[10px]">~</span>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={toDateInput(values[1])}
          onChange={(e) => onChange([values[0] ?? '', fromDateInput(e.target.value)])}
        />
      </div>
    )
  }
  return (
    <Input
      type="date"
      className="h-8 w-36 text-xs"
      value={toDateInput(values[0])}
      onChange={(e) => onChange([fromDateInput(e.target.value)])}
    />
  )
}

function useTableColumns(t: ReturnType<typeof useTranslations<'home'>>, formatRelative: (v: string) => string): ColumnDef<AgentUsageRecord>[] {
  return [
    {
      accessorKey: 'role',
      header: t('table.agent'),
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
      header: t('table.model'),
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
            <span className="truncate text-xs max-w-40">{model || t('table.modelUnknown')}</span>
          </div>
        )
      }
    },
    {
      accessorKey: 'summary',
      header: t('table.summary'),
      cell: ({ row }) => (
        <span className="line-clamp-2 text-xs text-muted-foreground max-w-64">
          {row.original.summary || '—'}
        </span>
      )
    },
    {
      accessorKey: 'totalCostUsd',
      header: t('table.cost'),
      cell: ({ row }) => {
        const { totalCostUsd } = row.original
        return (
          <div className="flex flex-col gap-0.5 font-mono text-xs tabular-nums">
            <span>{formatCurrency(totalCostUsd)}</span>
            <Tooltip>
              <TooltipTrigger render={<span className="text-muted-foreground text-[10px] cursor-default" />}>
                  {formatTokens(row.original.inputTokens)} {t('table.tokensIn')} / {formatTokens(row.original.outputTokens)} {t('table.tokensOut')}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {t('table.total')} {formatTokens(row.original.totalTokens)} · {t('table.cacheHit')} {row.original.inputTokens > 0 ? Math.round((row.original.cachedInputTokens / row.original.inputTokens) * 100) : 0}%
              </TooltipContent>
            </Tooltip>
          </div>
        )
      }
    },
    {
      accessorKey: 'status',
      header: t('table.status'),
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
      header: t('table.duration'),
      cell: ({ row }) => {
        const { startedAt, completedAt, durationMs } = row.original
        const ms = typeof durationMs === 'number' && durationMs > 0
          ? durationMs
          : new Date(completedAt).getTime() - new Date(startedAt).getTime()
        return <span className="font-mono text-xs tabular-nums">{formatDuration(Number.isFinite(ms) && ms > 0 ? ms : 0)}</span>
      }
    },
    {
      accessorKey: 'completedAt',
      header: t('table.time'),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{formatRelative(row.original.completedAt)}</span>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row, table }) => {
        const meta = table.options.meta as { onViewDetail?: (record: AgentUsageRecord) => void } | undefined
        return <SessionDetailButton onClick={() => meta?.onViewDetail?.(row.original)} />
      }
    },
  ]
}
