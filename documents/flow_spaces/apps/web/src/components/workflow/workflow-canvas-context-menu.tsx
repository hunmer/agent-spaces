'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useLocalizedNodeDefinitionsByCategory } from '@/lib/workflow-nodes';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
interface CanvasContextMenuProps {
  children: React.ReactNode;
  onAddNode: (type: string, position: { x: number; y: number }) => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  onFitView?: () => void;
  onAutoLayout?: () => void;
  onExport?: () => void;
  onEdgeLineStyleChange?: (lineStyle: 'default' | 'solid' | 'dashed') => void;
  canvasPosition?: { x: number; y: number } | null;
}

// Minimal icon components (inline to avoid importing all of lucide)
function AddNodeIcon({ className }: { className?: string }) {
  return <span className={className}>+</span>;
}
function Copy({ className }: { className?: string }) {
  return <span className={className}>⎘</span>;
}
function Paste({ className }: { className?: string }) {
  return <span className={className}>📋</span>;
}
function SelectAll({ className }: { className?: string }) {
  return <span className={className}>☐</span>;
}
function FitView({ className }: { className?: string }) {
  return <span className={className}>⊞</span>;
}
function Layout({ className }: { className?: string }) {
  return <span className={className}>◈</span>;
}
function Export({ className }: { className?: string }) {
  return <span className={className}>↗</span>;
}
function Check({ className }: { className?: string }) {
  return <span className={className}>✓</span>;
}

export function WorkflowCanvasContextMenu({
  children,
  onAddNode,
  onPaste,
  onSelectAll,
  onFitView,
  onAutoLayout,
  onExport,
  onEdgeLineStyleChange,
  canvasPosition,
}: CanvasContextMenuProps) {
  const categories = useLocalizedNodeDefinitionsByCategory();
  const t = useTranslations('workflows');

  const handleAddNode = useCallback((type: string) => {
    const pos = canvasPosition || { x: 250, y: 250 };
    onAddNode(type, pos);
  }, [canvasPosition, onAddNode]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Add node submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="text-xs">
            <AddNodeIcon className="mr-2 h-3 w-3" />
            {t('contextMenu.addNode')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {Object.entries(categories).map(([category, defs]) => (
              <ContextMenuSub key={category}>
                <ContextMenuSubTrigger className="text-xs">
                  {category}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  {defs
                    .filter(d => d.manualCreate !== false && d.type !== 'start' && d.type !== 'end')
                    .map(def => (
                      <ContextMenuItem
                        key={def.type}
                        className="text-xs"
                        onClick={() => handleAddNode(def.type)}
                      >
                        {def.label}
                      </ContextMenuItem>
                    ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {onPaste && (
          <ContextMenuItem className="text-xs" onClick={onPaste}>
            <Paste className="mr-2 h-3 w-3" />
            {t('contextMenu.paste')}
          </ContextMenuItem>
        )}

        {onSelectAll && (
          <ContextMenuItem className="text-xs" onClick={onSelectAll}>
            <SelectAll className="mr-2 h-3 w-3" />
            {t('contextMenu.selectAll')}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {onFitView && (
          <ContextMenuItem className="text-xs" onClick={onFitView}>
            <FitView className="mr-2 h-3 w-3" />
            {t('contextMenu.fitView')}
          </ContextMenuItem>
        )}

        {onAutoLayout && (
          <ContextMenuItem className="text-xs" onClick={onAutoLayout}>
            <Layout className="mr-2 h-3 w-3" />
            {t('contextMenu.autoLayout')}
          </ContextMenuItem>
        )}

        {onExport && (
          <ContextMenuItem className="text-xs" onClick={onExport}>
            <Export className="mr-2 h-3 w-3" />
            {t('contextMenu.exportJson')}
          </ContextMenuItem>
        )}

        {onEdgeLineStyleChange && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger className="text-xs">
                {t('contextMenu.edgeLineStyle')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-36">
                {(['default', 'solid', 'dashed'] as const).map(lineStyle => (
                  <ContextMenuItem
                    key={lineStyle}
                    className="text-xs"
                    onClick={() => onEdgeLineStyleChange(lineStyle)}
                  >
                    <Check className="mr-2 h-3 w-3" />
                    {t(`contextMenu.edgeLineStyleOptions.${lineStyle}`)}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
