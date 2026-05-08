'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Info, Users, GitBranch, Trash2, UserPlus } from 'lucide-react';
import { AgentIcon } from '@/components/common/agent-icon';
import { AddMemberDialog } from '@/components/chat/add-member-dialog';
import { getAgentDisplayName, getMemberDisplayName } from '@/lib/agent-members';
import { ISSUE_STATUS_COLOR } from './issue-status-colors';
import type { AgentConfig, Issue, Task } from '@agent-spaces/shared';

interface IssueDetailInfoPanelProps {
  issue: Issue;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueTasks: Task[];
  members: string[];
  enabledAgents: AgentConfig[];
  onAddMembers: (newMembers: string[]) => Promise<void>;
  onDeleteIssue: () => void;
  t: (key: string, params?: Record<string, string | number | Date>) => string;
}

export function IssueDetailInfoPanel({
  issue,
  workspaceId,
  open,
  onOpenChange,
  issueTasks,
  members,
  enabledAgents,
  onAddMembers,
  onDeleteIssue,
  t,
}: IssueDetailInfoPanelProps) {
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const memberIds = new Set(members);
  const candidateMembers = enabledAgents
    .filter((agent) => !memberIds.has(agent.id))
    .map((agent) => ({
      id: agent.id,
      label: getAgentDisplayName(agent),
      description: agent.role,
    }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 p-0 gap-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{t('detail.tabInfo')}</SheetTitle>
          <SheetDescription>{issue.title}</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="info" className="flex flex-col flex-1 min-h-0">
          <TabsList className="w-full rounded-none border-b bg-transparent h-9 p-0 shrink-0">
            <TabsTrigger value="info" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Info className="size-3.5" />{t('detail.tabInfo')}
            </TabsTrigger>
            <TabsTrigger value="members" className="flex-1 gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Users className="size-3.5" />{t('detail.tabMembers')}
            </TabsTrigger>
          </TabsList>
          <ScrollArea className="min-h-0 flex-1">
            <TabsContent value="info" className="p-4 mt-0 space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t('detail.infoStatus')}</span>
                  <Badge variant={ISSUE_STATUS_COLOR[issue.status]} className="text-[10px]">
                    {t(`status.${issue.status}`)}
                  </Badge>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t('detail.infoIssueId')}</span>
                  <span className="font-mono text-xs">{issue.id.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t('detail.infoTaskCount')}</span>
                  <span>{issueTasks.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t('detail.infoMemberCount')}</span>
                  <span>{members.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t('detail.infoCreatedAt')}</span>
                  <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t('detail.infoUpdatedAt')}</span>
                  <span>{new Date(issue.updatedAt).toLocaleDateString()}</span>
                </div>
                {issue.branch && (
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoBranch')}</span>
                    <span className="font-mono text-xs flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />{issue.branch}
                    </span>
                  </div>
                )}
                {issue.prUrl && (
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{t('detail.infoPr')}</span>
                    <span className="text-xs truncate max-w-[140px]">{issue.prUrl}</span>
                  </div>
                )}
              </div>
              {issue.description && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t('detail.infoDescription')}</span>
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
                <UserPlus className="size-3.5 mr-1" />{t('detail.addMember')}
              </Button>
            </TabsContent>
          </ScrollArea>
        </Tabs>
        <div className="shrink-0 p-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={onDeleteIssue}
          >
            <Trash2 className="size-3.5 mr-1.5" />{t('detail.deleteIssue')}
          </Button>
        </div>
      </SheetContent>

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        candidates={candidateMembers}
        onAdd={onAddMembers}
      />
    </Sheet>
  );
}
