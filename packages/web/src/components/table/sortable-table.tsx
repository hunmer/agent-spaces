"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"

import { Badge } from "@/components/reui/badge"
import {
  DataGrid,
  DataGridContainer,
} from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"

export interface IData {
  id: string
  name: string
  availability: "online" | "away" | "busy" | "offline"
  avatar: string
  status: "active" | "inactive"
  flag: string // Emoji flags
  email: string
  company: string
  role: string
  joined: string
  location: string
  balance: number
}

// Availability status cell
const AvailabilityStatus = ({ availability }: { availability: string }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500"
      case "away":
        return "bg-yellow-500"
      case "busy":
        return "bg-red-500"
      case "offline":
        return "bg-gray-400"
      default:
        return "bg-gray-400"
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "online":
        return "Online"
      case "away":
        return "Away"
      case "busy":
        return "Busy"
      case "offline":
        return "Offline"
      default:
        return "Unknown"
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={`size-2 rounded-full ${getStatusColor(availability)}`} />
      <span className="text-muted-foreground text-sm">
        {getStatusLabel(availability)}
      </span>
    </div>
  )
}

export interface SortableTableProps {
  data: IData[]
  isLoading?: boolean
}

/**
 * SortableTable — 可排序、可分页、可拖拽列的数据表格。
 *
 * 从 c-filters-7 的 DataGrid 区抽离而来，内部自管理排序 / 分页 / 列顺序状态，
 * 仅通过 `data` 与 `isLoading` 受控驱动，便于和外部筛选器组合。
 */
export function SortableTable({ data, isLoading = false }: SortableTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 5,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ])

  // Reset to the first page whenever the underlying data changes
  // (e.g. when the caller applies a new set of filters).
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [data])

  const columns = useMemo<ColumnDef<IData>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: ({ column }) => (
          <DataGridColumnHeader title="Staff" column={column} />
        ),
        cell: ({ row }) => {
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarImage
                  src={row.original.avatar}
                  alt={row.original.name}
                />
                <AvatarFallback>
                  {row.original.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-px">
                <div className="text-foreground font-medium">
                  {row.original.name}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {row.original.email}
                </div>
              </div>
            </div>
          )
        },
        size: 200,
        enableSorting: true,
        enableHiding: false,
        meta: {
          skeleton: (
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ),
        },
      },
      {
        accessorKey: "company",
        id: "company",
        header: ({ column }) => (
          <DataGridColumnHeader title="Company" column={column} />
        ),
        cell: (info) => <span>{info.getValue() as string}</span>,
        size: 150,
        enableSorting: true,
        enableHiding: false,
        meta: {
          skeleton: <Skeleton className="h-4 w-20" />,
        },
      },
      {
        accessorKey: "role",
        id: "role",
        header: ({ column }) => (
          <DataGridColumnHeader title="Occupation" column={column} />
        ),
        cell: (info) => <span>{info.getValue() as string}</span>,
        size: 125,
        enableSorting: true,
        enableHiding: false,
        meta: {
          skeleton: <Skeleton className="h-4 w-16" />,
        },
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status

          if (status == "active") {
            return <Badge variant="success-outline">Active</Badge>
          } else if (status == "inactive") {
            return <Badge variant="destructive-outline">Inactive</Badge>
          } else if (status == "archived") {
            return <Badge variant="warning-outline">Archived</Badge>
          }
        },
        size: 100,
        meta: {
          skeleton: <Skeleton className="h-4 w-16 rounded-full" />,
        },
      },
      {
        accessorKey: "availability",
        id: "availability",
        header: "Availability",
        cell: ({ row }) => (
          <AvailabilityStatus availability={row.original.availability} />
        ),
        size: 120,
        enableSorting: true,
        meta: {
          skeleton: (
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3.5 w-12" />
            </div>
          ),
        },
      },
      {
        accessorKey: "location",
        id: "location",
        header: ({ column }) => (
          <DataGridColumnHeader title="Location" column={column} />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <img
              src={`https://flagcdn.com/${row.original.flag.toLowerCase()}.svg`}
              alt={row.original.flag}
              className="size-4 rounded-full object-cover"
            />
            <span>{row.original.location}</span>
          </div>
        ),
        size: 180,
        enableSorting: true,
        meta: {
          skeleton: (
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ),
        },
      },
      {
        accessorKey: "balance",
        id: "balance",
        header: ({ column }) => (
          <DataGridColumnHeader title="Balance" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            ${row.original.balance.toLocaleString()}
          </span>
        ),
        size: 120,
        enableSorting: true,
        meta: {
          skeleton: <Skeleton className="h-4 w-16" />,
        },
      },
    ],
    []
  )

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    columns.map((column) => column.id as string)
  )

  const table = useReactTable({
    columns,
    data,
    pageCount: Math.ceil((data?.length || 0) / pagination.pageSize),
    getRowId: (row: IData) => row.id,
    state: {
      pagination,
      sorting,
      columnOrder,
    },
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <DataGrid
      table={table}
      isLoading={isLoading}
      loadingMode="skeleton"
      recordCount={data?.length || 0}
      tableLayout={{
        dense: true,
        columnsMovable: true,
      }}
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
