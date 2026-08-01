'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowRight, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type WorkflowAutoLayoutOptions = {
  layoutEngine?: string;
  parentId?: string;
  nodeIds?: string[];
  grid?: {
    rows: number;
    columns: number;
    horizontalGap: number;
    verticalGap: number;
  };
};

interface WorkflowAutoLayoutMenuProps {
  onAutoLayout?: (direction: 'LR' | 'TB', options?: WorkflowAutoLayoutOptions) => void;
  layoutEngine?: string;
  parentId?: string;
  nodeIds?: string[];
  disabled?: boolean;
  buttonClassName?: string;
  iconClassName?: string;
}

export function WorkflowAutoLayoutMenu({
  onAutoLayout,
  layoutEngine,
  parentId,
  nodeIds,
  disabled = false,
  buttonClassName = 'h-6 w-6 p-0',
  iconClassName = 'h-3.5 w-3.5',
}: WorkflowAutoLayoutMenuProps) {
  const t = useTranslations('workflows');
  const nodeCount = Math.max(nodeIds?.length ?? 1, 1);
  const defaultColumns = Math.ceil(Math.sqrt(nodeCount));
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(Math.ceil(nodeCount / defaultColumns));
  const [columns, setColumns] = useState(defaultColumns);
  const [horizontalGap, setHorizontalGap] = useState(60);
  const [verticalGap, setVerticalGap] = useState(60);
  const autoLayoutOptions = useMemo(() => ({
    ...(layoutEngine ? { layoutEngine } : {}),
    ...(parentId ? { parentId } : {}),
    ...(nodeIds ? { nodeIds } : {}),
  }), [layoutEngine, nodeIds, parentId]);
  const isDisabled = disabled || !onAutoLayout;
  const applyAutoLayout = (direction: 'LR' | 'TB') => {
    onAutoLayout?.(direction, autoLayoutOptions);
    setOpen(false);
  };
  const applyGrid = () => {
    onAutoLayout?.('LR', {
      ...autoLayoutOptions,
      grid: { rows, columns, horizontalGap, verticalGap },
    });
    setOpen(false);
  };
  const setGridColumns = (value: number) => {
    const nextColumns = Math.max(1, Math.min(nodeCount, value || 1));
    setColumns(nextColumns);
    setRows(Math.ceil(nodeCount / nextColumns));
  };
  const setGridRows = (value: number) => {
    const nextRows = Math.max(1, Math.min(nodeCount, value || 1));
    setRows(nextRows);
    setColumns(Math.ceil(nodeCount / nextRows));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={(
        <Button
          variant="ghost"
          size="sm"
          className={buttonClassName}
          disabled={isDisabled}
          title={t('canvasToolbar.autoLayout')}
          aria-label={t('canvasToolbar.autoLayout')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      >
        <LayoutGrid className={iconClassName} />
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-64 gap-3" onPointerDown={(event) => event.stopPropagation()}>
        <div className="space-y-1.5">
          <div className="text-xs font-medium">{t('canvasToolbar.autoLayout')}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => applyAutoLayout('LR')} disabled={isDisabled}>
              <ArrowRight />{t('canvasToolbar.horizontalLayout')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => applyAutoLayout('TB')} disabled={isDisabled}>
              <ArrowDown />{t('canvasToolbar.verticalLayout')}
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-2.5">
          <div className="text-xs font-medium">{t('canvasToolbar.gridLayout')}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t('canvasToolbar.rows')}
              <Input type="number" min={1} max={nodeCount} value={rows} onChange={(event) => setGridRows(Number(event.target.value))} className="h-7 text-xs" />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t('canvasToolbar.columns')}
              <Input type="number" min={1} max={nodeCount} value={columns} onChange={(event) => setGridColumns(Number(event.target.value))} className="h-7 text-xs" />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t('canvasToolbar.horizontalGap')}
              <Input type="number" min={0} max={300} value={horizontalGap} onChange={(event) => setHorizontalGap(Math.max(0, Number(event.target.value) || 0))} className="h-7 text-xs" />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">
              {t('canvasToolbar.verticalGap')}
              <Input type="number" min={0} max={300} value={verticalGap} onChange={(event) => setVerticalGap(Math.max(0, Number(event.target.value) || 0))} className="h-7 text-xs" />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4].filter(columnCount => columnCount <= nodeCount).map(columnCount => (
              <Button key={columnCount} type="button" variant="secondary" size="sm" className="h-6 px-2" onClick={() => setGridColumns(columnCount)}>
                {columnCount === 1 ? t('canvasToolbar.singleColumn') : t('canvasToolbar.columnPreset', { count: columnCount })}
              </Button>
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={applyGrid} disabled={isDisabled}>
            {t('canvasToolbar.applyGrid')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
