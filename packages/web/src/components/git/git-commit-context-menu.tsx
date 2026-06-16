"use client";

import { useState } from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGitStore } from "@/stores/git";
import { useEditorStore } from "@/stores/editor";
import { useChannelStore } from "@/stores/channel";
import { useAgentStore } from "@/stores/agent";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { errMsg } from "./git-commit-utils";
import { copyToClipboard } from "@/lib/utils";

interface CommitEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface Props {
  workspaceId: string;
  entry: CommitEntry;
  onRefreshAll: () => void;
  onOpenPrompt: (title: string, label: string, placeholder: string, onSubmit: (v: string) => void) => void;
}

export function GitCommitContextMenu({ workspaceId, entry, onRefreshAll, onOpenPrompt }: Props) {
  const t = useTranslations('git.commits');
  const tc = useTranslations('common');
  const {
    getCommitDiff, getRemoteUrl, checkout, checkoutDetached,
    createBranch, deleteBranch, createTag, cherryPick, getMergeBase, resetToCommit,
  } = useGitStore();
  const [resetOpen, setResetOpen] = useState(false);
  const openCommitDiff = useEditorStore((s) => s.openCommitDiff);
  const { activeChannelId, sendMessage } = useChannelStore();
  const agents = useAgentStore((s) => s.agents);

  const handleOpenChanges = async () => {
    try {
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      if (diffs.length > 0) openCommitDiff(workspaceId, entry.hash, entry.message, diffs);
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleOpenOnGitHub = async () => {
    try {
      const remoteUrl = await getRemoteUrl(workspaceId);
      if (!remoteUrl) { toast.error(t('contextMenu.failed'), { description: 'No remote URL' }); return; }
      window.open(remoteUrl.replace(/\.git$/, '') + '/commit/' + entry.hash, '_blank');
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCheckoutCommit = async () => {
    try { await checkout(workspaceId, entry.hash); toast.success(t('contextMenu.checkedOut')); onRefreshAll(); }
    catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCheckoutDetached = async () => {
    try { await checkoutDetached(workspaceId, entry.hash); toast.success(t('contextMenu.checkedOut')); onRefreshAll(); }
    catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCreateBranch = () => {
    onOpenPrompt(t('contextMenu.createBranch'), t('contextMenu.branchName'), 'feature/...', async (name) => {
      try { await createBranch(workspaceId, name, entry.hash); toast.success(t('contextMenu.branchCreated')); onRefreshAll(); }
      catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
    });
  };

  const handleCreateTag = () => {
    onOpenPrompt(t('contextMenu.createTag'), t('contextMenu.tagName'), 'v1.0.0', async (name) => {
      try { await createTag(workspaceId, name, entry.hash); toast.success(t('contextMenu.tagCreated')); }
      catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
    });
  };

  const handleCherryPick = async () => {
    try { await cherryPick(workspaceId, entry.hash); toast.success(t('contextMenu.cherryPicked')); onRefreshAll(); }
    catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCompareWithRemote = async () => {
    try {
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      useGitStore.setState({ diffs });
      toast.info(t('contextMenu.comparingWith', { hash: entry.hash.slice(0, 7) }));
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCompareWithMergeBase = async () => {
    try {
      const base = await getMergeBase(workspaceId);
      if (!base) { toast.error(t('contextMenu.failed'), { description: 'No merge base' }); return; }
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      useGitStore.setState({ diffs });
      toast.info(t('contextMenu.comparingWith', { hash: base.slice(0, 7) }));
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleExplainChanges = async () => {
    if (!activeChannelId) { toast.error(t('contextMenu.failed'), { description: 'No active channel' }); return; }
    const agent = agents.find(a => a.enabled && a.role !== 'bot' && a.role !== 'scheduler');
    const diffSummary = await getCommitDiff(workspaceId, entry.hash).then(diffs =>
      diffs.map(d => d.path).join('\n')
    ).catch(() => '');
    const text = agent
      ? `@${agent.name} Explain the changes in commit \`${entry.hash.slice(0, 7)}\`: ${entry.message.split('\n')[0]}\n\nChanged files:\n${diffSummary}`
      : `Explain the changes in commit \`${entry.hash.slice(0, 7)}\`: ${entry.message.split('\n')[0]}\n\nChanged files:\n${diffSummary}`;
    sendMessage(workspaceId, activeChannelId, text, agent ? [agent.id] : []);
  };

  return (
    <>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem onClick={handleOpenChanges}>{t('contextMenu.openChanges')}</ContextMenuItem>
        <ContextMenuItem onClick={handleOpenOnGitHub}>{t('contextMenu.openOnGitHub')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleCheckoutCommit}>{t('contextMenu.checkout')}</ContextMenuItem>
        <ContextMenuItem onClick={handleCheckoutDetached}>{t('contextMenu.checkoutDetached')}</ContextMenuItem>
        <ContextMenuItem onClick={handleCreateBranch}>{t('contextMenu.createBranch')}</ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const branchList = useGitStore.getState().branches.filter(b => !b.current);
          if (!branchList.length) { toast.error(t('contextMenu.failed'), { description: 'No other branches' }); return; }
          onOpenPrompt(t('contextMenu.deleteBranch'), t('contextMenu.branchToDelete'), branchList.map(b => b.name).join(', '), async (name) => {
            try { await deleteBranch(workspaceId, name); toast.success(t('contextMenu.branchDeleted')); onRefreshAll(); }
            catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
          });
        }}>{t('contextMenu.deleteBranch')}</ContextMenuItem>
        <ContextMenuItem onClick={handleCreateTag}>{t('contextMenu.createTag')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleCherryPick}>{t('contextMenu.cherryPick')}</ContextMenuItem>
        <ContextMenuItem onClick={() => setTimeout(() => setResetOpen(true), 0)}>{t('contextMenu.resetToCommit')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('contextMenu.compareWith')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={handleCompareWithRemote}>{t('contextMenu.compareWithRemote')}</ContextMenuItem>
            <ContextMenuItem onClick={handleCompareWithMergeBase}>{t('contextMenu.compareWithMergeBase')}</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => { copyToClipboard(entry.hash); toast.success(t('contextMenu.commitIdCopied')); }}>
          {t('contextMenu.copyCommitId')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => { copyToClipboard(entry.message); toast.success(t('contextMenu.commitMessageCopied')); }}>
          {t('contextMenu.copyCommitMessage')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleExplainChanges}>{t('contextMenu.explainChanges')}</ContextMenuItem>
      </ContextMenuContent>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('contextMenu.resetToCommit')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('contextMenu.confirmReset', { hash: entry.hash.slice(0, 7) })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={async () => {
              try { await resetToCommit(workspaceId, entry.hash); toast.success(t('contextMenu.resetDone')); setResetOpen(false); onRefreshAll(); }
              catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
            }}>{t('contextMenu.resetToCommit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
