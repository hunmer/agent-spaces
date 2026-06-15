'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import { useAgentStore } from '@/stores/agent';
import { useChannelStore } from '@/stores/channel';
import { useEditorSendStore } from '@/stores/editor-send';
import { toast } from 'sonner';
import type { AgentConfig } from '@agent-spaces/shared';

export function SendToChannelDialog() {
  const { pendingSendToChannel, setPendingSendToChannel } = useEditorSendStore();
  const { agents } = useAgentStore();
  const { createChannel, sendMessage } = useChannelStore();

  const [selectedAgent, setSelectedAgent] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const enabledAgents = agents.filter((a: AgentConfig) => a.enabled !== false);

  useEffect(() => {
    if (pendingSendToChannel) {
      setMessage(pendingSendToChannel.position);
      setSelectedAgent([]);
    }
  }, [pendingSendToChannel]);

  const handleClose = (open: boolean) => {
    if (!open) {
      setPendingSendToChannel(null);
      setSelectedAgent([]);
      setMessage('');
    }
  };

  const handleSubmit = async () => {
    if (!pendingSendToChannel || selectedAgent.length === 0) return;
    setLoading(true);
    try {
      const agent = agents.find((a: AgentConfig) => a.id === selectedAgent[0]);
      const agentName = agent?.name || selectedAgent[0];
      await createChannel(pendingSendToChannel.workspaceId, '', 'general', selectedAgent, message);
      const { channels } = useChannelStore.getState();
      const channel = channels[channels.length - 1];
      if (channel) {
        const mentionHtml = `<span data-type="mention" data-id="${selectedAgent[0]}" data-label="${agentName}"></span>`;
        const content = `${mentionHtml} ${message}`;
        sendMessage(
          pendingSendToChannel.workspaceId,
          channel.id,
          content,
          selectedAgent,
        );
      }
      toast.success('已创建频道并发送消息');
      handleClose(false);
    } catch {
      toast.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  if (!pendingSendToChannel) return null;

  const pickedAgent = selectedAgent.length > 0
    ? enabledAgents.find((a: AgentConfig) => a.id === selectedAgent[0])
    : null;

  return (
    <>
      <Dialog open onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>发送到新频道</DialogTitle>
            <DialogDescription>选择目标 Agent，创建频道并发送代码位置</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">目标 Agent</label>
              <button
                type="button"
                onClick={() => setAgentPickerOpen(true)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors hover:bg-muted"
              >
                {pickedAgent ? (
                  <span className="truncate">{pickedAgent.name}</span>
                ) : (
                  <span className="text-muted-foreground">选择 Agent...</span>
                )}
              </button>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="消息内容"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>取消</Button>
              <Button onClick={handleSubmit} disabled={loading || selectedAgent.length === 0}>
                {loading ? '发送中...' : '确定'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AgentPickerDialog
        open={agentPickerOpen}
        onClose={() => setAgentPickerOpen(false)}
        onSubmit={(ids: string[]) => {
          setSelectedAgent(ids);
          setAgentPickerOpen(false);
        }}
        title="选择 Agent"
        description="选择一个 Agent 作为频道目标"
        agents={enabledAgents.map((a: AgentConfig) => ({
          id: a.id,
          name: a.name,
          avatarUrl: a.avatarUrl,
          icon: a.icon,
          description: a.description,
        }))}
        initialSelected={selectedAgent}
        confirmText="选择"
        singleSelect
      />
    </>
  );
}
