'use client';

import { useState } from 'react';
import { Plus, ChevronDown, ChevronRight, X, Search, Upload, Play, Pencil, Trash2 } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import type { QuickCommand } from '@agent-spaces/shared';

function CommandListItem({ command, running, onRun, onClose, onEdit, onDelete, onSelect }: {
  command: QuickCommand; running: boolean;
  onRun: () => void; onClose: () => void; onEdit: () => void; onDelete: () => void;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={running ? onSelect : undefined}
      className={`flex items-center gap-1 px-2 py-1 text-xs hover:bg-accent group ${running ? 'cursor-pointer' : 'cursor-default'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          if (running) onClose();
          else onRun();
        }}
        className={`shrink-0 p-0.5 rounded ${running ? 'text-green-500 hover:text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {running ? <X size={12} /> : <Play size={12} />}
      </button>
      <span className="truncate flex-1 font-mono">{command.name}</span>
      {running && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
      {hovered && (
        <>
          <button
            onClick={(event) => { event.stopPropagation(); onEdit(); }}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); onDelete(); }}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={11} />
          </button>
        </>
      )}
    </div>
  );
}

export function CommandSidebar({
  search, onSearchChange, commands, customCommands, folderGroups,
  customOpen, onCustomOpenChange, collapsedFolders, onToggleFolder,
  onImport, onAddCommand, workspaceId, isRunning, runningMap,
  removeSession, run, remove, setEditingCommand, setDialogOpen, onSelectSession, tc,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  commands: QuickCommand[];
  customCommands: QuickCommand[];
  folderGroups: Record<string, QuickCommand[]>;
  customOpen: boolean;
  onCustomOpenChange: (v: boolean) => void;
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (f: string) => void;
  onImport: () => void;
  onAddCommand: () => void;
  workspaceId: string;
  isRunning: (id: string) => boolean;
  runningMap: Record<string, { sessionId: string }>;
  removeSession: (id: string) => void;
  run: (wid: string, cid: string) => void;
  remove: (wid: string, cid: string) => void;
  setEditingCommand: (cmd: QuickCommand | undefined) => void;
  setDialogOpen: (open: boolean) => void;
  onSelectSession: (sessionId: string) => void;
  tc: (key: string) => string;
}) {
  return (
    <div className="flex flex-col h-full max-h-[50vh]">
      {/* Search bar + import button */}
      <div className="flex items-center gap-1 px-1.5 py-1.5 border-b border-border">
        <div className="flex items-center gap-1 flex-1 bg-muted rounded px-1.5 py-0.5">
          <Search size={12} className="text-muted-foreground shrink-0" />
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={tc('searchPlaceholder')}
            className="h-5 bg-transparent text-xs border-0 focus-visible:ring-0 focus-visible:border-0 px-1 min-w-0"
          />
          {search && (
            <button onClick={() => onSearchChange('')} className="text-muted-foreground hover:text-foreground">
              <X size={10} />
            </button>
          )}
        </div>
        <button
          onClick={onImport}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
          title={tc('import')}
        >
          <Upload size={13} />
        </button>
      </div>

      {/* Command list with collapsible groups */}
      <div className="flex-1 overflow-y-auto py-1">
        {commands.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">{tc('noCommands')}</div>
        ) : (
          <>
            {customCommands.length > 0 && (
              <Collapsible open={customOpen} onOpenChange={onCustomOpenChange}>
                <div className="flex items-center gap-1 px-2 py-0.5 group">
                  <CollapsibleTrigger className="flex items-center gap-1 flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
                    {customOpen ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />}
                    <span>{tc('customCommands')}</span>
                    <span className="text-muted-foreground/60">({customCommands.length})</span>
                  </CollapsibleTrigger>
                  <button
                    onClick={onAddCommand}
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
                      onClose={() => {
                        const s = runningMap[cmd.id];
                        if (s) removeSession(s.sessionId);
                      }}
                      onSelect={() => {
                        const s = runningMap[cmd.id];
                        if (s) onSelectSession(s.sessionId);
                      }}
                      onEdit={() => { setEditingCommand(cmd); setDialogOpen(true); }}
                      onDelete={() => remove(workspaceId, cmd.id)}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {Object.entries(folderGroups).map(([folder, cmds]) => {
              const isOpen = collapsedFolders[folder] !== true;
              return (
              <Collapsible
                key={folder}
                open={isOpen}
                onOpenChange={() => onToggleFolder(folder)}
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
                      onClose={() => {
                        const s = runningMap[cmd.id];
                        if (s) removeSession(s.sessionId);
                      }}
                      onSelect={() => {
                        const s = runningMap[cmd.id];
                        if (s) onSelectSession(s.sessionId);
                      }}
                      onEdit={() => { setEditingCommand(cmd); setDialogOpen(true); }}
                      onDelete={() => remove(workspaceId, cmd.id)}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
              );
            })}

            {customCommands.length === 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 group">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">{tc('customCommands')}</span>
                <button
                  onClick={onAddCommand}
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
  );
}
