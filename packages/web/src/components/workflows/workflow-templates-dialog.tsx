'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Download, Folder, Search, FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchStoreIndex } from '@/lib/agent-store';
import type { WorkflowTemplatePreset } from './workflow-templates';

interface WorkflowTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (data: WorkflowTemplatePreset['data']) => void;
  onImportLocal?: () => void;
}

interface WorkflowIndexItem {
  id: string;
  name: string;
  description: string;
  filename: string;
  category: string;
  nodeCount: number;
  agentCount: number;
}

export function WorkflowTemplatesDialog({ open, onOpenChange, onImport, onImportLocal }: WorkflowTemplatesDialogProps) {
  const t = useTranslations('workflows');
  const [importing, setImporting] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkflowIndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const index = await fetchStoreIndex<WorkflowIndexItem>('workflows/index.json');
      setTemplates(index);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, fetchTemplates]);

  const handleImport = async (item: WorkflowIndexItem) => {
    setImporting(item.id);
    try {
      const base = localStorage.getItem('agent-spaces:store-api-base') || '';
      const url = base
        ? `${base.replace(/\/+$/, '')}/workflows/${item.filename}`
        : `/agents-store/workflows/${item.filename}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const template: WorkflowTemplatePreset = await res.json();
      await onImport(template.data);
      onOpenChange(false);
    } finally {
      setImporting(null);
    }
  };

  const categories = Array.from(new Set(templates.map((tpl) => tpl.category).filter(Boolean)));

  const filtered = templates.filter((tpl) => {
    if (categoryFilter && tpl.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!tpl.name.toLowerCase().includes(q) && !tpl.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{t('templatesDialog.title')}</DialogTitle>
            {onImportLocal && (
              <Button variant="outline" size="sm" className="mr-6" onClick={onImportLocal}>
                <Upload className="size-3.5 mr-1" />
                {t('page.import')}
              </Button>
            )}
          </div>
          <DialogDescription>{t('templatesDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 gap-4 pt-2">
          {categories.length > 0 && (
            <ScrollArea className="hidden md:block w-44 shrink-0">
              <div className="flex flex-col gap-1 pr-2">
                <Button
                  variant={!categoryFilter ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setCategoryFilter('')}
                >
                  <FileText className="size-3.5 mr-1.5" />
                  {t('templatesDialog.all')}
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    variant={categoryFilter === cat ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                  >
                    <Folder className="size-3.5 mr-1.5" />
                    <span className="truncate">{cat}</span>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="relative mb-3">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('templatesDialog.searchPlaceholder')}
                className="pl-8"
              />
            </div>
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('templatesDialog.loading')}</div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('templatesDialog.empty')}</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 pr-2">
                  {filtered.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{item.name}</span>
                            {item.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                {item.category}
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                              {t('templatesDialog.agentCount', { count: item.agentCount })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={importing !== null}
                          onClick={() => handleImport(item)}
                        >
                          {importing === item.id ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <>
                              <Download className="size-3.5 mr-1" />
                              {t('templatesDialog.import')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
