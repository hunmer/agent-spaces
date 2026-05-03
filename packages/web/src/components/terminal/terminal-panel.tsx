'use client';

import { useEffect } from 'react';
import { Plus, ChevronDown, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTerminalStore } from '@/stores/terminal';
import { getWS } from '@/lib/ws';
import { TerminalInstance } from './terminal-instance';

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
}

export function TerminalPanel({ workspaceId }: TerminalPanelProps) {
  const { sessions, activeId, init, createSession, setActive, removeSession } = useTerminalStore();

  useEffect(() => {
    const ws = getWS(workspaceId);
    init(ws);
    if (sessions.length === 0) {
      createSession();
    }
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

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
                title="New Terminal"
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
                onClick={() => createSession(opt.value)}
                className="text-xs"
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden relative">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No terminal session
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
  );
}
