"use client";

import { useEffect, useCallback, useState } from "react";
import { GitCommit, GitBranch as BranchIcon, RefreshCw } from "lucide-react";
import { useGitStore } from "@/stores/git";
import { useChannelStore } from "@/stores/channel";
import { GitNotInitialized } from "./git-not-initialized";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface GitGraphPanelProps {
  workspaceId: string;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function GitGraphPanel({ workspaceId }: GitGraphPanelProps) {
  const t = useTranslations('git.graph');
  const tc = useTranslations('common');
  const tcm = useTranslations('git.commits.contextMenu');
  const th = useTranslations('home.time');
  const {
    log, status, notGitRepo, branches,
    loadLog, loadStatus, loadBranches,
    checkout, checkoutDetached, cherryPick, createBranch, deleteBranch,
    createTag, getCommitDiff, getRemoteUrl, getMergeBase,
  } = useGitStore();
  const { activeChannelId, sendMessage } = useChannelStore();
  const [promptDialog, setPromptDialog] = useState<{
    open: boolean;
    title: string;
    label: string;
    placeholder: string;
    onSubmit: (value: string) => void;
  }>({ open: false, title: '', label: '', placeholder: '', onSubmit: () => {} });
  const [promptValue, setPromptValue] = useState('');

  const refresh = useCallback(() => {
    loadLog(workspaceId);
    loadStatus(workspaceId);
  }, [workspaceId, loadLog, loadStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openPromptDialog = (title: string, label: string, placeholder: string, onSubmit: (v: string) => void) => {
    setPromptValue('');
    setPromptDialog({ open: true, title, label, placeholder, onSubmit });
  };

  const refreshAll = () => {
    refresh();
    loadBranches(workspaceId);
  };

  if (notGitRepo) {
    return (
      <div className="flex flex-col h-full overflow-hidden rounded-t-xl bg-background">
        <div className="flex items-center px-2 py-1.5 border-b">
          <span className="text-xs font-medium text-muted-foreground">{t('title')}</span>
        </div>
        <GitNotInitialized workspaceId={workspaceId} onInitialized={refresh} />
      </div>
    );
  }

  const branch = status?.branch ?? "—";
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-t-xl bg-background">
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        <div className="flex items-center gap-2 text-xs">
          <BranchIcon size={14} />
          <span className="font-mono font-medium">{branch}</span>
          {ahead > 0 && (
            <span className="text-green-600">↑{ahead}</span>
          )}
          {behind > 0 && (
            <span className="text-red-500">↓{behind}</span>
          )}
        </div>
        <button
          onClick={refresh}
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-auto pl-4">
        {log.map((entry, i) => {
          const isLast = i === log.length - 1;
          return (
            <ContextMenu key={entry.hash}>
              <ContextMenuTrigger>
                <div className="flex items-start gap-2 py-1">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <GitCommit size={14} className="text-blue-500 shrink-0" />
                    {!isLast && (
                      <div className="w-px flex-1 bg-border min-h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">{entry.message.split("\n")[0]}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs font-mono text-muted-foreground">
                        {entry.hash.slice(0, 7)}
                      </code>
                      <span className="text-xs text-muted-foreground">{entry.author}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(entry.date, th)}
                      </span>
                    </div>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="min-w-48">
                <ContextMenuItem onClick={async () => {
                  try {
                    const diffs = await getCommitDiff(workspaceId, entry.hash);
                    if (diffs.length > 0) {
                      const { selectFile } = useGitStore.getState();
                      selectFile(diffs[0].path);
                      useGitStore.setState({ diffs });
                    }
                  } catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                }}>
                  {tcm('openChanges')}
                </ContextMenuItem>
                <ContextMenuItem onClick={async () => {
                  try {
                    const remoteUrl = await getRemoteUrl(workspaceId);
                    if (!remoteUrl) { toast.error(tcm('failed'), { description: 'No remote URL' }); return; }
                    window.open(remoteUrl.replace(/\.git$/, '') + '/commit/' + entry.hash, '_blank');
                  } catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                }}>
                  {tcm('openOnGitHub')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={async () => {
                  try { await checkout(workspaceId, entry.hash); toast.success(tcm('checkedOut')); refreshAll(); }
                  catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                }}>
                  {tcm('checkout')}
                </ContextMenuItem>
                <ContextMenuItem onClick={async () => {
                  try { await checkoutDetached(workspaceId, entry.hash); toast.success(tcm('checkedOut')); refreshAll(); }
                  catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                }}>
                  {tcm('checkoutDetached')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  openPromptDialog(tcm('createBranch'), tcm('branchName'), 'feature/...', async (name) => {
                    try { await createBranch(workspaceId, name, entry.hash); toast.success(tcm('branchCreated')); refreshAll(); }
                    catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                  });
                }}>
                  {tcm('createBranch')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  const branchList = branches.filter(b => !b.current);
                  if (!branchList.length) { toast.error(tcm('failed'), { description: 'No other branches' }); return; }
                  openPromptDialog(tcm('deleteBranch'), tcm('branchToDelete'), branchList.map(b => b.name).join(', '), async (name) => {
                    try { await deleteBranch(workspaceId, name); toast.success(tcm('branchDeleted')); refreshAll(); }
                    catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                  });
                }}>
                  {tcm('deleteBranch')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  openPromptDialog(tcm('createTag'), tcm('tagName'), 'v1.0.0', async (name) => {
                    try { await createTag(workspaceId, name, entry.hash); toast.success(tcm('tagCreated')); }
                    catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                  });
                }}>
                  {tcm('createTag')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={async () => {
                  try { await cherryPick(workspaceId, entry.hash); toast.success(tcm('cherryPicked')); refreshAll(); }
                  catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                }}>
                  {tcm('cherryPick')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger>{tcm('compareWith')}</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuItem onClick={async () => {
                      try {
                        const diffs = await getCommitDiff(workspaceId, entry.hash);
                        useGitStore.setState({ diffs });
                        toast.info(tcm('comparingWith', { hash: entry.hash.slice(0, 7) }));
                      } catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                    }}>
                      {tcm('compareWithRemote')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={async () => {
                      try {
                        const base = await getMergeBase(workspaceId);
                        if (!base) { toast.error(tcm('failed'), { description: 'No merge base' }); return; }
                        const diffs = await getCommitDiff(workspaceId, entry.hash);
                        useGitStore.setState({ diffs });
                        toast.info(tcm('comparingWith', { hash: base.slice(0, 7) }));
                      } catch (err: unknown) { toast.error(tcm('failed'), { description: errMsg(err) }); }
                    }}>
                      {tcm('compareWithMergeBase')}
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => { navigator.clipboard.writeText(entry.hash); toast.success(tcm('commitIdCopied')); }}>
                  {tcm('copyCommitId')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => { navigator.clipboard.writeText(entry.message); toast.success(tcm('commitMessageCopied')); }}>
                  {tcm('copyCommitMessage')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => {
                  if (!activeChannelId) { toast.error(tcm('failed'), { description: 'No active channel' }); return; }
                  sendMessage(workspaceId, activeChannelId, `\`${entry.hash.slice(0, 7)}\` ${entry.message.split('\n')[0]}`);
                }}>
                  {tcm('addToChat')}
                </ContextMenuItem>
                <ContextMenuItem onClick={async () => {
                  if (!activeChannelId) { toast.error(tcm('failed'), { description: 'No active channel' }); return; }
                  const diffs = await getCommitDiff(workspaceId, entry.hash);
                  const fileNames = diffs.map(d => d.path).join(', ');
                  sendMessage(workspaceId, activeChannelId, `Explain the changes in commit \`${entry.hash.slice(0, 7)}\` (${fileNames}): ${entry.message.split('\n')[0]}`);
                }}>
                  {tcm('explainChanges')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        {!log.length && (
          <div className="p-2 text-xs text-muted-foreground">{tc('noData')}</div>
        )}
      </div>
      <Dialog open={promptDialog.open} onOpenChange={(open) => setPromptDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{promptDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{promptDialog.label}</label>
            <Input
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptDialog.placeholder}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptValue.trim()) {
                  promptDialog.onSubmit(promptValue.trim());
                  setPromptDialog((p) => ({ ...p, open: false }));
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialog((p) => ({ ...p, open: false }))}>
              {tc('cancel')}
            </Button>
            <Button
              disabled={!promptValue.trim()}
              onClick={() => {
                promptDialog.onSubmit(promptValue.trim());
                setPromptDialog((p) => ({ ...p, open: false }));
              }}
            >
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatRelativeTime(dateStr: string, t: any): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('justNow');
  if (minutes < 60) return t('minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('daysAgo', { n: days });
  return new Date(dateStr).toLocaleDateString();
}
