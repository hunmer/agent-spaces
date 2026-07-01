"use client"

import { useState } from "react"
import { useTranslations } from 'next-intl'
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table"
import type { AgentUsageRecord } from "@agent-spaces/shared"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePagination } from "@/hooks/use-pagination"
import { cn, textColorClass } from "@/lib/utils"
import { SessionDetailButton, UsageDashboardSessionDialog } from "./usage-dashboard-session-dialog"
import { formatCurrency, formatDuration, formatTokens, getModelIconUrl } from "./usage-dashboard-utils"

export function AgentRunsTable({ data, formatRelative }: { data: AgentUsageRecord[]; formatRelative: (v: string) => string }) {
  const t = useTranslations('home')
  const pageSize = 5
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })
  const [selectedRecord, setSelectedRecord] = useState<AgentUsageRecord | null>(null)

  const columns = useTableColumns(t, formatRelative)

  const table = useReactTable({
    data,
    columns,
    meta: {
      onViewDetail: (record: AgentUsageRecord) => setSelectedRecord(record),
    },
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
        {t('table.emptyMessage')}
      </div>
    )
  }

  return (
    <div className="w-full">
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
            {table.getState().pagination.pageIndex * pageSize + 1} {t('pagination.to')}{' '}
            {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getRowCount())}
          </span>{' '}
          {t('pagination.of')} <span>{table.getRowCount()}</span> {t('pagination.entries')}
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
        const { startedAt, completedAt } = row.original
        const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
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
