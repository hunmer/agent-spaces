'use client';

import { Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type DisplayNodeViewProps, tableHeaders, tableCells, readString, EmptyDisplay } from './utils';

export function TableDisplayView({ data }: DisplayNodeViewProps) {
  const headers = tableHeaders(data);
  const cells = tableCells(data);
  const selectionMode = readString(data.selectionMode) || 'none';

  if (headers.length === 0) {
    return <EmptyDisplay icon={<Table2 className="h-5 w-5" />} text="暂无表头" />;
  }

  return (
    <div className="nodrag nopan flex h-full w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
        <span>{cells.length} rows</span>
        <span className={cn(selectionMode !== 'none' && 'text-foreground')}>
          {selectionMode === 'single' ? 'Single' : selectionMode === 'multi' ? 'Multi' : 'No selection'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              {selectionMode !== 'none' ? <th className="w-5 px-1 py-1" /> : null}
              {headers.map(header => (
                <th key={header.id} className="max-w-24 truncate px-1.5 py-1 text-left font-medium">
                  {header.title || header.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.slice(0, 8).map(cell => (
              <tr key={cell.id} className="border-t border-border/50">
                {selectionMode !== 'none' ? (
                  <td className="px-1 py-1">
                    <span className="block h-2.5 w-2.5 rounded border border-border" />
                  </td>
                ) : null}
                {headers.map(header => (
                  <td key={header.id} className="max-w-24 truncate px-1.5 py-1">
                    {String(cell.data[header.id] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
