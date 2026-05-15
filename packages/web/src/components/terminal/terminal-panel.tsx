'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Plus, ChevronDown, X, FolderOpen, Terminal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTerminalStore } from '@/stores/terminal';
import { useCommandStore } from '@/stores/command';
import { getWS } from '@/lib/ws';
import { TerminalInstance } from './terminal-instance';
import { CommandDialog } from './command-dialog';
import { ImportCommandsDialog } from './import-commands-dialog';
import { CommandSidebar } from './command-sidebar';
import { TerminalToolbar } from './terminal-toolbar';
import { getShellOptions, getShellLabel } from './terminal-utils';
import type { QuickCommand } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';

interface TerminalPanelProps {
  workspaceId: string;
  boundDirs: string[];
}

export function TerminalPanel({ workspaceId, boundDirs }: TerminalPanelProps) {
  const { sessions, activeId, init, createSession, setActive, removeSession } = useTerminalStore();
  const { commands, load: loadCommands, run, remove, update, create, isRunning, runningMap } = useCommandStore();
  const { sendInput } = useTerminalStore();
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
  const [commandPopoverOpen, setCommandPopoverOpen] = useState(false);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [shellOptions, setShellOptions] = useState<Awaited<ReturnType<typeof getShellOptions>>>([]);

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

  const initRef = useRef<string | null>(null);
  useEffect(() => {
    const ws = getWS(workspaceId);
    init(ws, () => {
      // After server sessions restored, create default if none exist
      if (useTerminalStore.getState().sessions.length === 0) {
        handleCreateSession();
      }
    });
    if (initRef.current !== workspaceId) {
      initRef.current = workspaceId;
    }
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (workspaceId) loadCommands(workspaceId);
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getShellOptions().then(setShellOptions);
  }, []);

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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasteText(text);
    } catch {
      setPasteText('');
    }
    setPasteDialogOpen(true);
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
            <span className="font-mono text-[10px] opacity-60">{session.name ?? getShellLabel(session.shell, shellOptions)}</span>
            {!session.name && <span>{sessions.indexOf(session) + 1}</span>}
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
            {shellOptions.map((opt) => (
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

        {/* Commands button - visible only on small screens */}
        <div className="md:hidden ml-auto">
          <Popover open={commandPopoverOpen} onOpenChange={setCommandPopoverOpen}>
            <PopoverTrigger
              render={
                <button className="flex items-center gap-1 h-6 px-1.5 text-muted-foreground hover:text-foreground transition-colors" title={tc('title')}>
                  <Terminal size={14} />
                </button>
              }
            />
            <PopoverContent align="end" sideOffset={4} className="w-[260px] p-0 overflow-hidden">
              <CommandSidebar
                search={search}
                onSearchChange={setSearch}
                commands={commands}
                customCommands={customCommands}
                folderGroups={folderGroups}
                customOpen={customOpen}
                onCustomOpenChange={setCustomOpen}
                collapsedFolders={collapsedFolders}
                onToggleFolder={toggleFolder}
                onImport={() => { setImportOpen(true); setCommandPopoverOpen(false); }}
                onAddCommand={() => { setEditingCommand(undefined); setDialogOpen(true); setCommandPopoverOpen(false); }}
                workspaceId={workspaceId}
                isRunning={isRunning}
                runningMap={runningMap}
                removeSession={removeSession}
                run={run}
                remove={remove}
                setEditingCommand={setEditingCommand}
                setDialogOpen={(open) => { setDialogOpen(open); if (!open) return; }}
                tc={tc}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content: command sidebar + terminal */}
      <div className="flex flex-row flex-1 overflow-hidden">
        {/* Command sidebar - hidden on small screens */}
        <div className="hidden md:flex w-[200px] flex-col border-r border-border shrink-0 overflow-hidden">
          <CommandSidebar
            search={search}
            onSearchChange={setSearch}
            commands={commands}
            customCommands={customCommands}
            folderGroups={folderGroups}
            customOpen={customOpen}
            onCustomOpenChange={setCustomOpen}
            collapsedFolders={collapsedFolders}
            onToggleFolder={toggleFolder}
            onImport={() => setImportOpen(true)}
            onAddCommand={() => { setEditingCommand(undefined); setDialogOpen(true); }}
            workspaceId={workspaceId}
            isRunning={isRunning}
            runningMap={runningMap}
            removeSession={removeSession}
            run={run}
            remove={remove}
            setEditingCommand={setEditingCommand}
            setDialogOpen={setDialogOpen}
            tc={tc}
          />
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

      {/* Bottom toolbar */}
      <TerminalToolbar activeId={activeId} sendInput={sendInput} onPaste={handlePaste} />

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

      {/* Paste command dialog */}
      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pasteCommand')}</DialogTitle>
            <DialogDescription>{t('pasteCommandDescription')}</DialogDescription>
          </DialogHeader>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="w-full h-40 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t('pasteCommandPlaceholder')}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPasteDialogOpen(false)}
              className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              disabled={!pasteText.trim() || !activeId}
              onClick={() => {
                if (!activeId) return;
                const lines = pasteText.split('\n');
                let delay = 0;
                for (const line of lines) {
                  const cmd = line.trim();
                  if (!cmd) continue;
                  setTimeout(() => sendInput(activeId, cmd + '\n'), delay);
                  delay += 300;
                }
                setPasteDialogOpen(false);
              }}
              className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {t('confirm')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
