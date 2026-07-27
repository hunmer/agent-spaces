"use client";

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatPanel } from '@/components/chat/chat-panel';
import { useAgentStore } from '@/stores/agent';
import { useChannelStore } from '@/stores/channel';
import { sdk } from '@/lib/sdk';
import { cn } from '@/lib/utils';
import type { MentionedAgent } from '@/components/chat/chat-input-utils';
import type { MiniAppProject } from '@agent-spaces/sdk';

interface MiniAppChatProps {
  project: MiniAppProject;
  workspaceId?: string;
  activeFilePath: string;
  fileContent: string;
  onUpdateProject: (updates: Partial<Pick<MiniAppProject, 'agentConfigId'>>) => void;
}

export function MiniAppChat({
  project,
  workspaceId,
  activeFilePath,
  fileContent,
  onUpdateProject,
}: MiniAppChatProps) {
  const t = useTranslations('mini-apps');
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);

  const ensureAgents = useAgentStore((s) => s.ensure);
  const { loadChannels, upsertChannel } = useChannelStore();

  const resolvedWorkspaceId = workspaceId ?? project.id;

  useEffect(() => {
    ensureAgents();
  }, [ensureAgents]);

  useEffect(() => {
    if (!resolvedWorkspaceId) return;
    loadChannels(resolvedWorkspaceId);
  }, [resolvedWorkspaceId, loadChannels]);

  const ensureChannel = useCallback(async () => {
    if (!resolvedWorkspaceId) return;
    const existing = useChannelStore.getState().channels.find((c) => c.id === project.id);
    if (existing) {
      setChannelId(existing.id);
      return;
    }
    try {
      const channel = await sdk.channel.create(resolvedWorkspaceId, {
        id: project.id,
        name: t('chat.channelName', { name: project.name }),
        type: 'mini-apps',
        members: [],
      });
      upsertChannel(channel);
      setChannelId(channel.id);
    } catch {
      // channel may already exist on server, try loading
      await loadChannels(resolvedWorkspaceId);
      const found = useChannelStore.getState().channels.find((c) => c.id === project.id);
      if (found) setChannelId(found.id);
    }
  }, [resolvedWorkspaceId, project.id, project.name, loadChannels, upsertChannel, t]);

  useEffect(() => {
    if (open) ensureChannel();
  }, [ensureChannel, open]);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {open && (
          <div className="flex h-[min(820px,calc(100vh-7rem))] w-[min(520px,calc(100vw-3rem))] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
            <div className="flex items-center justify-end border-b px-2 py-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setOpen(false)}
                title={t('chat.close')}
              >
                <X className="size-4" />
              </Button>
            </div>

            {!resolvedWorkspaceId ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {t('chat.noWorkspace')}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatPanel
                  workspaceId={resolvedWorkspaceId}
                  channelId={channelId ?? project.id}
                  miniAppContext={{
                    projectId: project.id,
                    activeFilePath,
                    projectType: project.type,
                    fileContent,
                  }}
                  agentFilesDirectory={project.agentPermissions?.includes('Files') ? {
                    projectId: project.id,
                    scope: 'editor',
                    label: 'agent_files/editor',
                  } : undefined}
                  onAgentActivated={(agent: MentionedAgent) => {
                    onUpdateProject({ agentConfigId: agent.id });
                  }}
                />
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            'flex size-14 cursor-pointer items-center justify-center rounded-full shadow-2xl transition-colors',
            open
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          title={open ? t('chat.closeChat') : t('chat.openChat')}
        >
          {open ? <X className="size-6" /> : <MessageSquare className="size-6" />}
        </button>
      </div>
    </>
  );
}
