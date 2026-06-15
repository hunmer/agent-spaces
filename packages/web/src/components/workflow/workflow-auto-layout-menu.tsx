'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type WorkflowAutoLayoutOptions = {
  layoutEngine?: string;
  parentId?: string;
  nodeIds?: string[];
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
  const autoLayoutOptions = useMemo(() => ({
    ...(layoutEngine ? { layoutEngine } : {}),
    ...(parentId ? { parentId } : {}),
    ...(nodeIds ? { nodeIds } : {}),
  }), [layoutEngine, nodeIds, parentId]);
  const isDisabled = disabled || !onAutoLayout;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={(
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        <DropdownMenuItem disabled={isDisabled} onClick={() => onAutoLayout?.('LR', autoLayoutOptions)}>
          {t('canvasToolbar.horizontalLayout')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isDisabled} onClick={() => onAutoLayout?.('TB', autoLayoutOptions)}>
          {t('canvasToolbar.verticalLayout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
