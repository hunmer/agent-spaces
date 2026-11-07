'use client';

import { useState, useRef } from 'react';
import type { ImportItem } from './types';
import { getZipSkillEntries } from './zip-skill-entries';

interface UseImportOptions {
  /** Called with the user-confirmed, selected items. */
  onImportBatch: (items: ImportItem[]) => void;
  /**
   * Optional git importer. When provided, git import is enabled and the
   * returned items feed the preview panel. Returns parsed items or null.
   */
  onImportFromGit?: (url: string) => Promise<{ name: string; content: string }[] | null>;
}

/**
 * Generic import orchestrator: parses .md / folder / zip / (git) sources
 * into {@link ImportItem}s and drives the preview panel open/close state.
 *
 * Mirrors the original skills-only `useSkillImport` but is source-agnostic;
 * the caller decides how `onImportBatch` persists items.
 */
export function useImport({ onImportBatch, onImportFromGit }: UseImportOptions) {
  const mdInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDefaultGroup, setImportDefaultGroup] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitLoading, setGitLoading] = useState(false);
  const [gitDialogOpen, setGitDialogOpen] = useState(false);

  const openPreview = (items: ImportItem[], defaultGroup = '') => {
    setImportItems(items);
    setImportDefaultGroup(defaultGroup);
    setImportDialogOpen(true);
  };

  const handleMdSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: ImportItem[] = [];
    for (const file of Array.from(files)) {
      const content = await file.text();
      const name = file.name.replace(/\.md$/i, '');
      items.push({
        id: `md-${name}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        group: '',
        content,
        selected: true,
        sourceName: file.name,
      });
    }
    openPreview(items);
    e.target.value = '';
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const folderMap = new Map<string, File[]>();
    for (const file of Array.from(files)) {
      const parts = file.webkitRelativePath.split('/');
      const folderName = parts[0];
      if (!folderMap.has(folderName)) folderMap.set(folderName, []);
      folderMap.get(folderName)!.push(file);
    }

    const items: ImportItem[] = [];
    for (const [folderName, folderFiles] of folderMap) {
      let skillFile = folderFiles.find((f) => f.name === 'SKILL.md');
      if (!skillFile) skillFile = folderFiles.find((f) => f.name.endsWith('.md'));
      if (!skillFile) continue;

      const content = await skillFile.text();
      items.push({
        id: `folder-${folderName}-${Math.random().toString(36).slice(2, 8)}`,
        name: folderName,
        group: '',
        content,
        selected: true,
        sourceName: folderName,
      });
    }
    openPreview(items);
    e.target.value = '';
  };

  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);
      const zipName = file.name.replace(/\.zip$/i, '');

      const items: ImportItem[] = [];
      for (const skillEntry of getZipSkillEntries(Object.keys(zip.files), zipName)) {
        const content = await zip.file(skillEntry.path)!.async('string');
        const files = await Promise.all(skillEntry.files
          .filter((path) => !zip.files[path].dir)
          .map(async (path) => ({
            path: skillEntry.root ? path.slice(skillEntry.root.length + 1) : path,
            content: await zip.file(path)!.async('base64'),
          })));
        items.push({
          id: `zip-${skillEntry.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: skillEntry.name,
          group: '',
          content,
          selected: true,
          sourceName: skillEntry.name,
          files,
        });
      }

      openPreview(items, zipName);
    } catch (err) {
      console.error('Failed to extract ZIP:', err);
    }
    e.target.value = '';
  };

  const handleImportConfirm = (items: ImportItem[]) => {
    onImportBatch(items);
    setImportDialogOpen(false);
    setImportItems([]);
  };

  const handleImportCancel = () => {
    setImportDialogOpen(false);
    setImportItems([]);
  };

  const handleGitImport = async () => {
    if (!onImportFromGit) return;
    const url = gitUrl.trim();
    if (!url) return;
    setGitLoading(true);
    const result = await onImportFromGit(url);
    setGitLoading(false);
    if (result && result.length > 0) {
      const repoName = url.split('/').pop()?.replace(/\.git$/i, '') || '';
      const items: ImportItem[] = result.map((s) => ({
        id: `git-${s.name}-${Math.random().toString(36).slice(2, 8)}`,
        name: s.name,
        group: '',
        content: s.content,
        selected: true,
        sourceName: s.name,
      }));
      openPreview(items, repoName);
      setGitDialogOpen(false);
    }
    setGitUrl('');
  };

  return {
    mdInputRef,
    folderInputRef,
    zipInputRef,
    importItems,
    setImportItems,
    importDialogOpen,
    importDefaultGroup,
    gitUrl,
    setGitUrl,
    gitLoading,
    gitDialogOpen,
    setGitDialogOpen,
    handleMdSelect,
    handleFolderSelect,
    handleZipSelect,
    handleImportConfirm,
    handleImportCancel,
    handleGitImport,
    /** Trigger callbacks for the menu items. */
    openMdPicker: () => mdInputRef.current?.click(),
    openFolderPicker: () => folderInputRef.current?.click(),
    openZipPicker: () => zipInputRef.current?.click(),
    openGitDialog: () => setGitDialogOpen(true),
  };
}
