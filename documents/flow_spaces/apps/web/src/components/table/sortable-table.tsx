"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"

import {
  DataGrid,
  DataGridContainer,
} from "@/components/reui/data-grid/data-grid"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

export interface SortableTableProps<TData extends object> {
  data: TData[]
  columns: ColumnDef<TData>[]
  isLoading?: boolean
  pageSize?: number
  getRowId?: (row: TData, index: number) => string
  emptyMessage?: ReactNode
}

/**
 * SortableTable — 通用可排序、可分页、可拖拽列的数据表格。
 *
 * `columns` 与 `data` 均由调用方提供，内部自管理排序 / 分页 / 列顺序状态。
 * 列头排序控件由调用方在 `column.header` 里用 `DataGridColumnHeader` 自行决定。
 */
export function SortableTable<TData extends object>({
  data,
  columns,
  isLoading = false,
  pageSize = 20,
  getRowId,
  emptyMessage,
}: SortableTableProps<TData>) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    columns.map((c) => c.id as string)
  )

  // 数据或列变化时回到首页、重置列顺序
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0, pageSize }))
  }, [data, pageSize])
  useEffect(() => {
    setColumnOrder(columns.map((c) => c.id as string))
  }, [columns])

  const table = useReactTable({
    columns,
    data,
    pageCount: Math.ceil((data?.length || 0) / pagination.pageSize),
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
    state: { pagination, sorting, columnOrder },
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    )
  }

  return (
    <DataGrid
      table={table}
      recordCount={data?.length || 0}
      emptyMessage={emptyMessage}
      tableLayout={{ dense: true, columnsMovable: true }}
    >
      <div className="w-full space-y-2.5">
        <DataGridContainer>
          <ScrollArea>
            <DataGridTable />
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DataGridContainer>
        <DataGridPagination />
      </div>
    </DataGrid>
  )
}
