'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { pluginConfigSchemeApi, workflowPluginSchemeApi } from '@/lib/workflow-plugin-api';
import { cn } from '@/lib/utils';

export function PluginConfigSchemeControl({
  pluginId,
  selectedScheme,
  onSelect,
  onEdit,
  className,
  legacyWorkflowId,
  onCreateRequest,
}: {
  pluginId: string;
  selectedScheme?: string;
  onSelect: (schemeName: string) => void | Promise<void>;
  onEdit: (schemeName?: string) => void;
  className?: string;
  legacyWorkflowId?: string;
  onCreateRequest?: () => void;
}) {
  const t = useTranslations('workflows');
  const [schemes, setSchemes] = useState<string[]>([]);
  const [newSchemeOpen, setNewSchemeOpen] = useState(false);
  const [newSchemeName, setNewSchemeName] = useState('');

  const loadSchemes = useCallback(async () => {
    try {
      const pluginSchemes = await pluginConfigSchemeApi.list(pluginId);
      if (!legacyWorkflowId) {
        setSchemes(pluginSchemes);
        return;
      }
      const legacySchemes = await workflowPluginSchemeApi.list(legacyWorkflowId, pluginId);
      const missingSchemes = legacySchemes.filter(name => !pluginSchemes.includes(name));
      for (const name of missingSchemes) {
        const values = await workflowPluginSchemeApi.read(legacyWorkflowId, pluginId, name);
        await pluginConfigSchemeApi.save(pluginId, name, values);
      }
      setSchemes([...pluginSchemes, ...missingSchemes].sort());
    } catch {
      setSchemes([]);
    }
  }, [legacyWorkflowId, pluginId]);

  useEffect(() => {
    void loadSchemes();
  }, [loadSchemes]);

  const createScheme = useCallback(async () => {
    const name = newSchemeName.trim();
    if (!name) return;
    await pluginConfigSchemeApi.create(pluginId, name);
    await loadSchemes();
    await onSelect(name);
    setNewSchemeOpen(false);
  }, [loadSchemes, newSchemeName, onSelect, pluginId]);

  const deleteCurrentScheme = useCallback(async () => {
    if (!selectedScheme) return;
    await pluginConfigSchemeApi.delete(pluginId, selectedScheme);
    await onSelect('');
    await loadSchemes();
  }, [loadSchemes, onSelect, pluginId, selectedScheme]);

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)} onClick={(event) => event.stopPropagation()}>
      <Popover>
        <PopoverTrigger
          nativeButton={false}
          render={<span />}
          className="inline-flex h-6 min-w-0 flex-1 items-center gap-0.5 rounded px-1.5 text-[10px] hover:bg-muted cursor-pointer"
        >
          <span className="truncate">{selectedScheme || t('sidebar.defaultConfig')}</span>
          <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-44 p-0" align="end">
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem value="__default__" className="text-xs" onSelect={() => void onSelect('')}>
                  {t('sidebar.defaultConfig')}
                </CommandItem>
                {schemes.map(name => (
                  <CommandItem key={name} value={name} className="text-xs" onSelect={() => void onSelect(name)}>
                    {name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  className="text-xs text-primary"
                  onSelect={() => {
                    if (onCreateRequest) {
                      onCreateRequest();
                      return;
                    }
                    setNewSchemeName('');
                    setNewSchemeOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> {t('sidebar.addScheme')}
                </CommandItem>
                {selectedScheme ? (
                  <CommandItem className="text-xs text-destructive" onSelect={() => void deleteCurrentScheme()}>
                    <Trash2 className="mr-1 h-3 w-3" /> {t('sidebar.deleteScheme')}
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title={t('sidebar.editConfig')} onClick={() => onEdit(selectedScheme)}>
        <Settings className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog open={newSchemeOpen} onOpenChange={setNewSchemeOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sidebar.newSchemeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sidebar.newSchemeDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={newSchemeName} onChange={(event) => setNewSchemeName(event.target.value)} placeholder={t('sidebar.schemeNamePlaceholder')} className="text-sm" />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('sidebar.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={!newSchemeName.trim()} onClick={() => void createScheme()}>{t('sidebar.create')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
