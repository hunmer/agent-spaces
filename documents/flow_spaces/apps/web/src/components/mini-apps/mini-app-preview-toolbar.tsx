"use client";

import { useTranslations } from 'next-intl';
import { RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface MiniAppPreviewToolbarProps {
  autoRefresh: boolean;
  onAutoRefreshChange: (auto: boolean) => void;
  onRefresh: () => void;
}

export function MiniAppPreviewToolbar({
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
}: MiniAppPreviewToolbarProps) {
  const t = useTranslations('mini-apps');
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Switch
          id="auto-refresh"
          checked={autoRefresh}
          onCheckedChange={onAutoRefreshChange}
          className="scale-75"
        />
        <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
          <Zap className="h-3 w-3 inline mr-1" />
          {t('preview.autoPreview')}
        </Label>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh}>
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  );
}
