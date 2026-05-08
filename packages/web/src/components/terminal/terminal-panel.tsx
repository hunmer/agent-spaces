'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { Plus, ChevronDown, ChevronRight, X, FolderOpen, Play, Square, Pencil, Trash2, Search, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTerminalStore } from '@/stores/terminal';
import { useCommandStore } from '@/stores/command';
import { getWS } from '@/lib/ws';
import { TerminalInstance } from './terminal-instance';
import { CommandDialog } from './command-dialog';
import { ImportCommandsDialog } from './import-commands-dialog';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { QuickCommand } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

const SHELL_OPTIONS = isMac
  ? [
      { value: '/bin/zsh', label: 'zsh' },
      { value: '/bin/bash', label: 'bash' },
    ]
  : [
      { value: 'cmd.exe', label: 'CMD' },
      { value: 'powershell.exe', label: 'PowerShell' },
    ];

const DEFAULT_SHELL = SHELL_OPTIONS[0];

function getShellLabel(shell?: string) {
  if (!shell) return DEFAULT_SHELL.label;
  return SHELL_OPTIONS.find((s) => s.value === shell)?.label ?? shell;
}

interface TerminalPanelProps {
  workspaceId: string;
  boundDirs: string[];
}

function CommandListItem({ command, running, onRun, onStop, onEdit, onDelete }: {
  command: QuickCommand; running: boolean;
  onRun: () => void; onStop: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-accent group cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={running ? onStop : onRun}
        className={`shrink-0 p-0.5 rounded ${running ? 'text-green-500 hover:text-green-600' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {running ? <Square size={12} /> : <Play size={12} />}
      </button>
      <span className="truncate flex-1 font-mono">{command.name}</span>
      {running && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
      {hovered && (
        <>
          <button onClick={onEdit} className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"><Pencil size={11} /></button>
          <button onClick={onDelete} className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
        </>
      )}
    </div>
  );
}

export function TerminalPanel({ workspaceId, boundDirs }: TerminalPanelProps) {
  const { sessions, activeId, init, createSession, setActive, removeSession } = useTerminalStore();
  const { commands, load: loadCommands, run, stop, remove, update, create, isRunning } = useCommandStore();
  const t = useTranslations('terminal');
  const tc = useTranslations('commands');

  const [dirPickerOpen, setDirPickerOpen] = useState(false);
  const [pendingShell, setPendingShell] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<QuickCommand | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customOpen, setCustomOpen] = useState(true);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const resolveCwd = useCallback((): string | undefined => {
    if (boundDirs.length === 0) return undefined;
    if (boundDirs.length === 1) return boundDirs[0];
    return undefined;
  }, [boundDirs]);

  const handleCreateSession = useCallback((shell?: string) => {
    const cwd = resolveCwd();
    if (cwd === undefined && boundDirs.length > 1) {
      setPendingShell(shell);
      setDirPickerOpen(true);
      return;
    }
    createSession(shell, cwd);
  }, [resolveCwd, boundDirs.length, createSession]);

  const handleDirSelect = useCallback((dir: string) => {
    setDirPickerOpen(false);
    createSession(pendingShell, dir);
    setPendingShell(undefined);
  }, [pendingShell, createSession]);

  useEffect(() => {
    const ws = getWS(workspaceId);
    init(ws);
    if (sessions.length === 0) {
      handleCreateSession();
    }
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (workspaceId) loadCommands(workspaceId);
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group commands by folder
  const { customCommands, folderGroups } = useMemo(() => {
    const filtered = search
      ? commands.filter(c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.command.toLowerCase().includes(search.toLowerCase())
        )
      : commands;

    const custom: QuickCommand[] = [];
    const groups: Record<string, QuickCommand[]> = {};

    for (const cmd of filtered) {
      if (cmd.folder) {
        if (!groups[cmd.folder]) groups[cmd.folder] = [];
        groups[cmd.folder].push(cmd);
      } else {
        custom.push(cmd);
      }
    }

    return { customCommands: custom, folderGroups: groups };
  }, [commands, search]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  const handleImport = async (scripts: { name: string; command: string; folder: string }[]) => {
    for (const s of scripts) {
      await create(workspaceId, {
        name: s.name,
        command: s.command,
        folder: s.folder,
        cwd: s.folder,
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 bg-muted border-b border-border overflow-x-auto">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActive(session.id)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-t transition-colors shrink-0 ${
              activeId === session.id
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            <span className="font-mono text-[10px] opacity-60">{getShellLabel(session.shell)}</span>
            <span>{sessions.indexOf(session) + 1}</span>
            <span
              onClick={(e) => { e.stopPropagation(); removeSession(session.id); }}
              className="ml-1 hover:text-destructive cursor-pointer"
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="flex items-center gap-0.5 h-6 px-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title={t('newTerminal')}
              >
                <Plus size={14} />
                <ChevronDown size={10} />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-[120px]">
            {SHELL_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => handleCreateSession(opt.value)}
                className="text-xs"
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content: command sidebar + terminal */}
      <div className="flex flex-row flex-1 overflow-hidden">
        {/* Command sidebar */}
        <div className="w-[200px] flex flex-col border-r border-border shrink-0 overflow-hidden">
          {/* Search bar + import button */}
          <div className="flex items-center gap-1 px-1.5 py-1.5 border-b border-border">
            <div className="flex items-center gap-1 flex-1 bg-muted rounded px-1.5 py-0.5">
              <Search size={12} className="text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tc('searchPlaceholder')}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground min-w-0"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                  <X size={10} />
                </button>
              )}
            </div>
            <button
              onClick={() => setImportOpen(true)}
              className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
              title={tc('import')}
            >
              <Download size={13} />
            </button>
          </div>

          {/* Command list with collapsible groups */}
          <div className="flex-1 overflow-y-auto py-1">
            {commands.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">{tc('noCommands')}</div>
            ) : (
              <>
                {/* Custom commands (no folder) - collapsible */}
                {customCommands.length > 0 && (
                  <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
                    <div className="flex items-center gap-1 px-2 py-0.5 group">
                      <CollapsibleTrigger className="flex items-center gap-1 flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
                        {customOpen ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />}
                        <span>{tc('customCommands')}</span>
                        <span className="text-muted-foreground/60">({customCommands.length})</span>
                      </CollapsibleTrigger>
                      <button
                        onClick={() => { setEditingCommand(undefined); setDialogOpen(true); }}
                        className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title={tc('addCommand')}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <CollapsibleContent>
                      {customCommands.map(cmd => (
                        <CommandListItem
                          key={cmd.id}
                          command={cmd}
                          running={isRunning(cmd.id)}
                          onRun={() => run(workspaceId, cmd.id)}
                          onStop={() => stop(workspaceId, cmd.id)}
                          onEdit={() => { setEditingCommand(cmd); setDialogOpen(true); }}
                          onDelete={() => remove(workspaceId, cmd.id)}
                        />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Folder groups */}
                {Object.entries(folderGroups).map(([folder, cmds]) => {
                  const isOpen = collapsedFolders[folder] !== true;
                  return (
                  <Collapsible
                    key={folder}
                    open={isOpen}
                    onOpenChange={() => toggleFolder(folder)}
                  >
                    <div className="flex items-center gap-1 px-2 py-0.5 mt-1 group">
                      <CollapsibleTrigger
                        className="flex items-center gap-1 flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
                      >
                        {isOpen ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />}
                        <span className="truncate">{folder.split('/').pop() || folder}</span>
                        <span className="text-muted-foreground/60">({cmds.length})</span>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      {cmds.map(cmd => (
                        <CommandListItem
                          key={cmd.id}
                          command={cmd}
                          running={isRunning(cmd.id)}
                          onRun={() => run(workspaceId, cmd.id)}
                          onStop={() => stop(workspaceId, cmd.id)}
                          onEdit={() => { setEditingCommand(cmd); setDialogOpen(true); }}
                          onDelete={() => remove(workspaceId, cmd.id)}
                        />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                  );
                })}

                {/* Show add button when no custom commands exist */}
                {customCommands.length === 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 group">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">{tc('customCommands')}</span>
                    <button
                      onClick={() => { setEditingCommand(undefined); setDialogOpen(true); }}
                      className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title={tc('addCommand')}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Terminal content */}
        <div className="flex-1 overflow-hidden relative">
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {t('noSession')}
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="absolute inset-0"
                style={{ display: activeId === session.id ? 'block' : 'none' }}
              >
                <TerminalInstance
                  sessionId={session.id}
                  workspaceId={workspaceId}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Directory picker dialog */}
      <Dialog open={dirPickerOpen} onOpenChange={setDirPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('selectWorkingDirectory')}</DialogTitle>
            <DialogDescription>
              {t('selectWorkingDirectoryDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {boundDirs.map((dir) => (
              <button
                key={dir}
                onClick={() => handleDirSelect(dir)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs">{dir}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Command dialog */}
      <CommandDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        command={editingCommand}
        defaultCwd={boundDirs[0]}
        onSubmit={async (data) => {
          if (editingCommand) {
            await update(workspaceId, editingCommand.id, data);
          } else {
            await create(workspaceId, data);
          }
        }}
      />

      {/* Import commands dialog */}
      <ImportCommandsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultPath={boundDirs[0]}
        onImport={handleImport}
      />
    </div>
  );
}
