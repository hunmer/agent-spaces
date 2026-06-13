'use client';

import { useMemo, useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { getCoreRowModel, getSortedRowModel, getPaginationRowModel, useReactTable, type SortingState, type PaginationState } from '@tanstack/react-table';
import { DataGrid, DataGridContainer } from '@/components/reui/data-grid/data-grid';
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import type { SqliteQueryResult } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';

export interface ResultTableProps {
  result: SqliteQueryResult | null;
  isLoading?: boolean;
  error?: string | null;
}

function renderCell(v: unknown): React.ReactNode {
  if (v == null) return <span className="text-muted-foreground/50">NULL</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ResultTable({ result, isLoading = false, error = null }: ResultTableProps) {
  const t = useTranslations();
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);

  const rows = result?.rows ?? [];
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols = result?.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    return cols.map((key) => ({
      accessorKey: key,
      id: key,
      header: key,
      cell: ({ row }) => renderCell(row.original[key]),
      enableSorting: true,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.columns, rows[0]]);

  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [result]);

  const table = useReactTable({
    columns, data: rows, state: { pagination, sorting },
    onPaginationChange: setPagination, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    pageCount: Math.ceil(rows.length / pagination.pageSize),
  });

  if (isLoading) {
    return <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>;
  }
  if (error) {
    return <div className="flex items-center gap-2 p-4 text-sm text-destructive"><AlertCircle className="size-4" />{error}</div>;
  }
  if (!result || rows.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{t('sqlite.emptyResult')}</div>;
  }

  return (
    <DataGrid table={table} recordCount={rows.length} tableLayout={{ dense: true }}>
      <div className="w-full space-y-2.5">
        {result.truncated && (
          <div className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
            {t('sqlite.truncated', { n: 10000 })}
          </div>
        )}
        <DataGridContainer>
          <ScrollArea>
            <DataGridTable />
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DataGridContainer>
        <DataGridPagination />
      </div>
    </DataGrid>
  );
}
