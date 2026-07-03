'use client';

import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Import trigger button, reused across dialog toolbars.
 * Designed to be passed as the `render` prop of
 * `PopoverTrigger` / `DropdownMenuTrigger`.
 *
 * `label` should come from each dialog's own i18n namespace
 * (e.g. t('import')) so existing translations stay intact.
 */
export function ImportButton({ label }: { label: string }) {
  return (
    <Button variant="outline" size="sm">
      <Upload className="size-3.5 mr-1" />
      {label}
    </Button>
  );
}
