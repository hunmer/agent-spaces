'use client';

import { useTranslations } from 'next-intl';
import { FileText, FolderOpen, FileArchive, GitBranch } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ImportButton } from '../import-button';

/** Trigger callbacks produced by {@link useImport}. */
export interface ImportMenuTriggers {
  openMdPicker: () => void;
  openFolderPicker: () => void;
  openZipPicker: () => void;
  openGitDialog: () => void;
}

interface FileImportMenuProps {
  /** Trigger button label (from caller's i18n namespace). */
  label: string;
  /** Trigger callbacks from useImport. */
  triggers: ImportMenuTriggers;
  /** Which import sources to show. Defaults to md/folder/zip. */
  enabled?: {
    md?: boolean;
    folder?: boolean;
    zip?: boolean;
    git?: boolean;
  };
  /** Controlled dropdown open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
}

/**
 * Import dropdown menu assembled from md / folder / zip / git entries.
 * Renders the trigger button + menu; the hidden file inputs live in the
 * caller (rendered via the refs returned by useImport) — pass `triggers`
 * here to wire the menu items to those pickers.
 */
export function FileImportMenu({
  label,
  triggers,
  enabled,
  open,
  onOpenChange,
  align = 'end',
}: FileImportMenuProps) {
  const t = useTranslations('import');
  const show = {
    md: enabled?.md ?? true,
    folder: enabled?.folder ?? true,
    zip: enabled?.zip ?? true,
    git: enabled?.git ?? false,
  };

  return (
    <ImportButton label={label} open={open} onOpenChange={onOpenChange} align={align}>
      {show.md && (
        <DropdownMenuItem onClick={triggers.openMdPicker}>
          <FileText className="size-3.5 mr-1.5" />
          {t('importFromMd')}
        </DropdownMenuItem>
      )}
      {show.folder && (
        <DropdownMenuItem onClick={triggers.openFolderPicker}>
          <FolderOpen className="size-3.5 mr-1.5" />
          {t('importFromFolder')}
        </DropdownMenuItem>
      )}
      {show.zip && (
        <DropdownMenuItem onClick={triggers.openZipPicker}>
          <FileArchive className="size-3.5 mr-1.5" />
          {t('importFromZip')}
        </DropdownMenuItem>
      )}
      {show.git && (
        <DropdownMenuItem onClick={triggers.openGitDialog}>
          <GitBranch className="size-3.5 mr-1.5" />
          {t('importFromGit')}
        </DropdownMenuItem>
      )}
    </ImportButton>
  );
}
