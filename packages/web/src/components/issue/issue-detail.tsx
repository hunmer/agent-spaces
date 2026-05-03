'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useIssueStore } from '@/stores/issue';
import { useTaskStore } from '@/stores/task';
import { useChannelStore } from '@/stores/channel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AvatarGroup } from '@/components/ui/avatar';
import { AgentIcon } from '@/components/common/agent-icon';
import { Play, RotateCcw, XCircle, User, Clock, GitBranch, PanelRightOpen, PanelRightClose, Info, Users, UserPlus } from 'lucide-react';
import { AddMemberDialog } from '@/components/chat/add-member-dialog';
import { IssueMessage } from '@/components/issue/issue-message';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import type { Editor } from '@tiptap/core';
import { ComposerShell } from '@/components/composer/composer-shell';
import { createSuggestionRenderer } from '@/components/composer/create-suggestion-renderer';
import { createSlashExtension } from '@/components/composer/create-slash-extension';
import { getAgentDisplayName, getMemberDisplayName, normalizeChannelMembersToAgentIds } from '@/lib/agent-members';
import type { IssueStatus, TaskStatus, AgentConfig, Message } from '@agent-spaces/shared';
import { getWS } from '@/lib/ws';

const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  in_progress: 'In Progress',
  review_pending: 'Review Pending',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  completed: 'Completed',
  archived: 'Archived',
  error: 'Error',
};

const ISSUE_STATUS_COLOR: Record<IssueStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  planned: 'outline',
  in_progress: 'default',
  review_pending: 'outline',
  changes_requested: 'destructive',
  approved: 'default',
  completed: 'secondary',
  archived: 'outline',
  error: 'destructive',
};

const TASK_STATUS_COLOR: Record<TaskStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  waiting_review: 'outline',
  retrying: 'outline',
  done: 'secondary',
  failed: 'destructive',
  cancelled: 'outline',
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  waiting_review: 'Waiting Review',
  retrying: 'Retrying',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

interface IssueDetailProps {
  workspaceId: string;
}

export function IssueDetail({ workspaceId }: IssueDetailProps) {
  const { issues, activeIssueId, startIssue } = useIssueStore();
  const { tasks, loadTasks, retryTask, cancelTask } = useTaskStore();
  const { messages, loadMessages, sendMessage, addMessage, updateMessage, deleteMessage } = useChannelStore();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const issue = issues.find((i) => i.id === activeIssueId);

  useEffect(() => {
    if (issue) {
      loadTasks(workspaceId, issue.id);
      if (issue.channelId) loadMessages(workspaceId, issue.channelId);
    }
  }, [issue, workspaceId, loadTasks, loadMessages]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspaces/${workspaceId}/agents/presets`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<AgentConfig[]>;
      })
      .then(setAgents)
      .catch((err) => {
        if (err.name !== 'AbortError') setAgents([]);
      });
    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    if (!issue?.channelId) return;
    const ws = getWS(workspaceId);
    const channelId = issue.channelId;
    const unsub = ws.on('channel.message', (data: unknown) => {
      const msg = data as { channelId: string };
      if (msg.channelId === channelId) addMessage(channelId, data as Message);
    });
    const unsubUpdate = ws.on('channel.message.updated', (data: unknown) => {
      const msg = data as { channelId: string };
      if (msg.channelId === channelId) updateMessage(channelId, data as Message);
    });
    const unsubDelete = ws.on('channel.message.deleted', (data: unknown) => {
      const msg = data as { channelId: string; messageId: string };
      if (msg.channelId === channelId) deleteMessage(channelId, msg.messageId);
    });
    const unsubCleared = ws.on('channel.messages.cleared', (data: unknown) => {
      const msg = data as { channelId: string };
      if (msg.channelId === channelId) {
        useChannelStore.setState((s) => ({ messages: { ...s.messages, [channelId]: [] } }));
      }
    });
    return () => { unsub(); unsubUpdate(); unsubDelete(); unsubCleared(); };
  }, [issue, workspaceId, addMessage, updateMessage, deleteMessage]);

  const mentionExtension = useMemo(
    () =>
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) => {
            const keyword = query.toLowerCase();
            return agents
              .filter((agent) =>
                agent.enabled !== false &&
                `${agent.name} ${agent.role} ${agent.description || ''}`.toLowerCase().includes(keyword)
              )
              .slice(0, 6)
              .map((agent) => ({
                id: agent.id,
                label: agent.name || agent.role,
                description: `${agent.role}${agent.description ? ` · ${agent.description}` : ''}`,
              }));
          },
          command: ({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: Record<string, unknown> }) => {
            editor.chain().focus().insertContentAt(range, [{ type: 'mention', attrs: props }]).run();
          },
          render: () => createSuggestionRenderer(),
        },
      }),
    [agents]
  );

  const slashExtension = useMemo(() => createSlashExtension(), []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write a comment... 支持 @mention，输入 / 打开命令' }),
      mentionExtension,
      slashExtension,
    ],
    editorProps: {
      attributes: { class: 'tiptap tiptap-chat' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          const hasPopup = document.querySelector('.suggestion-menu');
          if (hasPopup) return false;
          event.preventDefault();
          handleSendComment();
          return true;
        }
        return false;
      },
    },
    content: '',
  });

  const handleSendComment = useCallback(() => {
    if (!editor || !issue?.channelId) return;
    const text = editor.getText().trim();
    if (!text) return;
    sendMessage(workspaceId, issue.channelId, text);
    editor.commands.clearContent();
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, [editor, issue, workspaceId, sendMessage]);

  const canSubmit = !!editor?.getText().trim();

  if (!issue) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select an issue to view details
      </div>
    );
  }

  const issueTasks = tasks.filter((t) => t.issueId === issue.id);
  const channelMessages = Array.isArray(messages[issue.channelId]) ? messages[issue.channelId] : [];
  const members = issue.members ?? [];
  const enabledAgents = agents.filter((agent) => agent.enabled !== false);
  const memberIds = new Set(members);
  const candidateMembers = enabledAgents
    .filter((agent) => !memberIds.has(agent.id))
    .map((agent) => ({
      id: agent.id,
      label: getAgentDisplayName(agent),
      description: agent.role,
    }));

  const handleAddMembers = async (newMembers: string[]) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/issues/${issue.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        members: normalizeChannelMembersToAgentIds(enabledAgents, [...members, ...newMembers]).filter((member) => member !== 'user'),
      }),
    });
    const updated = await res.json();
    useIssueStore.getState().upsertIssue(updated);
  };

  const handleDeleteMessage = async (channelId: string, messageId: string) => {
    await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' });
  };

  const handleUpdateMessage = async (wsId: string, channelId: string, messageId: string, content: string) => {
    await fetch(`/api/workspaces/${wsId}/channels/${channelId}/messages/${messageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  };

  return (
    <div className="flex h-full">
      {/* 左侧：主内容区 */}
      <div className="flex flex-col flex-1 min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="p-4 pb-3 border-b">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold flex-1">{issue.title}</h2>
              <Badge variant={ISSUE_STATUS_COLOR[issue.status]}>
                {ISSUE_STATUS_LABEL[issue.status]}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setInfoOpen(!infoOpen)}
              >
                {infoOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {/* Members avatars */}
              {members.length > 0 && (
                <span className="flex items-center gap-1">
                  <AvatarGroup>
                    {members.slice(0, 4).map((member) => (
                      <AgentIcon
                        key={member}
                        agentId={member !== 'user' ? member : undefined}
                        name={getMemberDisplayName(enabledAgents, member)}
                        className="size-6 rounded-full"
                      />
                    ))}
                  </AvatarGroup>
                  <span>{members.length} member{members.length !== 1 ? 's' : ''}</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Created {new Date(issue.createdAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated {new Date(issue.updatedAt).toLocaleDateString()}
              </span>
              {issue.branch && (
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {issue.branch}
                </span>
              )}
              {issue.prUrl && (
                <span>PR: {issue.prUrl}</span>
              )}
            </div>
            {issue.description && (
              <p className="text-sm text-muted-foreground mt-2">{issue.description}</p>
            )}
            {issue.status === 'draft' && (
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => startIssue(workspaceId, issue.id)}>
                  <Play className="h-3 w-3 mr-1" />
                  Start
                </Button>
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="p-4 pb-2">
            <h3 className="text-sm font-medium mb-2">
              Tasks ({issueTasks.length})
            </h3>
            {issueTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground">No tasks yet</div>
            ) : (
              <div className="space-y-1">
                {issueTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2 rounded-md border text-sm"
                  >
                    <Badge variant={TASK_STATUS_COLOR[task.status]} className="text-[10px]">
                      {TASK_STATUS_LABEL[task.status]}
                    </Badge>
                    <span className="flex-1 truncate">{task.title}</span>
                    {task.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => retryTask(workspaceId, task.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    {(task.status === 'pending' || task.status === 'running' || task.status === 'retrying') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => cancelTask(workspaceId, task.id)}
                      >
                        <XCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="px-4 pt-2 pb-4 border-t">
            <h3 className="text-sm font-medium mb-3">Comments ({channelMessages.length})</h3>
            {issue.description && (
              <div className="pb-3 border-b">
                <div className="flex items-start gap-2.5">
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground shrink-0">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">Author</span>
                      <span className="text-[10px] text-muted-foreground">
                        commented {new Date(issue.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm bg-muted/50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {issue.description}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {channelMessages.map((c) => (
              <IssueMessage
                key={c.id}
                message={c}
                workspaceId={workspaceId}
                onDelete={handleDeleteMessage}
                onUpdate={handleUpdateMessage}
              />
            ))}
          </div>
        </div>

        {/* Comment input */}
        <ComposerShell
          editor={editor}
          canSubmit={canSubmit}
          onSubmit={handleSendComment}
          className="border-t px-3 py-2"
        />
      </div>

      {/* 右侧：信息面板 */}
      {infoOpen && (
        <div className="w-72 border-l flex flex-col">
          <Tabs defaultValue="info" className="flex flex-col flex-1">
            <TabsList className="w-full rounded-none border-b bg-transparent h-9 p-0">
              <TabsTrigger value="info" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                <Info className="size-3.5" />信息
              </TabsTrigger>
              <TabsTrigger value="members" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                <Users className="size-3.5" />成员
              </TabsTrigger>
            </TabsList>
            <ScrollArea className="flex-1">
              <TabsContent value="info" className="p-4 mt-0 space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">状态</span>
                    <Badge variant={ISSUE_STATUS_COLOR[issue.status]} className="text-[10px]">
                      {ISSUE_STATUS_LABEL[issue.status]}
                    </Badge>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">Issue ID</span>
                    <span className="font-mono text-xs">{issue.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">任务数</span>
                    <span>{issueTasks.length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">成员数</span>
                    <span>{members.length}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">创建时间</span>
                    <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">更新时间</span>
                    <span>{new Date(issue.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {issue.branch && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-muted-foreground">分支</span>
                      <span className="font-mono text-xs flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />{issue.branch}
                      </span>
                    </div>
                  )}
                  {issue.prUrl && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-muted-foreground">PR</span>
                      <span className="text-xs truncate max-w-[140px]">{issue.prUrl}</span>
                    </div>
                  )}
                </div>
                {issue.description && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">描述</span>
                    <p className="text-sm bg-muted/50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {issue.description}
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="members" className="p-4 mt-0 space-y-1">
                {members.map((member) => (
                  <div key={member} className="flex items-center gap-2 py-1.5">
                    <AgentIcon
                      agentId={member !== 'user' ? member : undefined}
                      name={getMemberDisplayName(enabledAgents, member)}
                      className="size-6 rounded-full"
                    />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{getMemberDisplayName(enabledAgents, member)}</p>
                      <p className="text-xs text-muted-foreground truncate">{member}</p>
                    </div>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs text-muted-foreground"
                  onClick={() => setAddMemberOpen(true)}
                >
                  <UserPlus className="size-3.5 mr-1" />添加成员
                </Button>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      )}

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        candidates={candidateMembers}
        onAdd={handleAddMembers}
      />
    </div>
  );
}
