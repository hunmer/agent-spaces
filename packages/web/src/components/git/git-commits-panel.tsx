"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { Upload, Download, Loader2, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { useGitStore } from "@/stores/git";
import { useChannelStore } from "@/stores/channel";
import { GitNotInitialized } from "./git-not-initialized";
import { GitRemoteDialog } from "./git-remote-dialog";
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

interface GitCommitsPanelProps {
  workspaceId: string;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? errMsg(err) : String(err);
}

function SyncBadge({ count, kind }: { count: number; kind: "push" | "pull" }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-medium leading-none text-background">
      {count}
    </span>
  );
}

export function GitCommitsPanel({ workspaceId }: GitCommitsPanelProps) {
  const t = useTranslations('git.commits');
  const tc = useTranslations('common');
  const {
    log, loading, notGitRepo, status, branches,
    loadLog, loadStatus, push, pull, getRemotes, addRemote,
    checkout, checkoutDetached, cherryPick, createBranch, deleteBranch,
    createTag, getCommitDiff, getRemoteUrl, getMergeBase,
  } = useGitStore();
  const { activeChannelId, sendMessage } = useChannelStore();
  const [syncing, setSyncing] = useState<"push" | "pull" | null>(null);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"push" | "pull" | null>(null);
  const [promptDialog, setPromptDialog] = useState<{
    open: boolean;
    title: string;
    label: string;
    placeholder: string;
    onSubmit: (value: string) => void;
  }>({ open: false, title: '', label: '', placeholder: '', onSubmit: () => {} });
  const [promptValue, setPromptValue] = useState('');

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const remoteHeadIndex = ahead > 0 ? ahead : -1;

  const refresh = useCallback(() => {
    loadLog(workspaceId);
    loadStatus(workspaceId);
  }, [workspaceId, loadLog, loadStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSync = async (action: "push" | "pull") => {
    setSyncing(action);
    try {
      const remotes = await getRemotes(workspaceId);
      if (!remotes.length) {
        setPendingAction(action);
        setRemoteDialogOpen(true);
        return;
      }
      await doSync(action);
    } catch (err: unknown) {
      if (errMsg(err)?.includes("No remote")) {
        setPendingAction(action);
        setRemoteDialogOpen(true);
      } else {
        toast.error(action === "push" ? t('pushFailed') : t('pullFailed'), { description: errMsg(err) });
      }
    } finally {
      setSyncing(null);
    }
  };

  const doSync = async (action: "push" | "pull") => {
    if (action === "push") {
      await push(workspaceId);
      toast.success(t('pushedSuccessfully'));
    } else {
      await pull(workspaceId);
      toast.success(t('pulledSuccessfully'));
    }
    refresh();
  };

  const handleRemoteSubmit = async (name: string, url: string) => {
    await addRemote(workspaceId, name, url);
    toast.success(t('remoteAdded'));
    if (pendingAction) {
      await doSync(pendingAction);
      setPendingAction(null);
    }
  };

  const openPromptDialog = (title: string, label: string, placeholder: string, onSubmit: (v: string) => void) => {
    setPromptValue('');
    setPromptDialog({ open: true, title, label, placeholder, onSubmit });
  };

  const handleOpenChanges = async (entry: { hash: string; message: string }) => {
    try {
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      if (diffs.length > 0) {
        // show first file diff in diff viewer
        const { selectFile } = useGitStore.getState();
        selectFile(diffs[0].path);
        useGitStore.setState({ diffs });
      }
      toast.success(t('contextMenu.openChanges'));
    } catch (err: unknown) {
      toast.error(t('contextMenu.failed'), { description: err instanceof Error ? errMsg(err) : String(err) });
    }
  };

  const handleOpenOnGitHub = async (entry: { hash: string }) => {
    try {
      const remoteUrl = await getRemoteUrl(workspaceId);
      if (!remoteUrl) {
        toast.error(t('contextMenu.failed'), { description: 'No remote URL found' });
        return;
      }
      const url = remoteUrl.replace(/\.git$/, '') + '/commit/' + entry.hash;
      window.open(url, '_blank');
    } catch (err: unknown) {
      toast.error(t('contextMenu.failed'), { description: errMsg(err) });
    }
  };

  const handleCheckout = async (entry: { hash: string }) => {
    try {
      await checkout(workspaceId, entry.hash);
      toast.success(t('contextMenu.checkedOut'));
      refresh();
    } catch (err: unknown) {
      toast.error(t('contextMenu.failed'), { description: errMsg(err) });
    }
  };

  const handleCheckoutDetached = async (entry: { hash: string }) => {
    try {
      await checkoutDetached(workspaceId, entry.hash);
      toast.success(t('contextMenu.checkedOut'));
      refresh();
    } catch (err: unknown) {
      toast.error(t('contextMenu.failed'), { description: errMsg(err) });
    }
  };

  const handleCreateBranch = (entry: { hash: string }) => {
    openPromptDialog(
      t('contextMenu.createBranch'),
      t('contextMenu.branchName'),
      'feature/...',
      async (name) => {
        try {
          await createBranch(workspaceId, name, entry.hash);
          toast.success(t('contextMenu.branchCreated'));
          refresh();
        } catch (err: unknown) {
          toast.error(t('contextMenu.failed'), { description: errMsg(err) });
        }
      },
    );
  };

  const handleDeleteBranch = () => {
    const branchList = branches.filter(b => !b.current);
    if (!branchList.length) {
      toast.error(t('contextMenu.failed'), { description: 'No other branches' });
      return;
    }
    openPromptDialog(
      t('contextMenu.deleteBranch'),
      t('contextMenu.branchToDelete'),
      branchList.map(b => b.name).join(', '),
      async (name) => {
        try {
          await deleteBranch(workspaceId, name);
          toast.success(t('contextMenu.branchDeleted'));
          refresh();
        } catch (err: unknown) {
          toast.error(t('contextMenu.failed'), { description: errMsg(err) });
        }
      },
    );
  };

  const handleCreateTag = (entry: { hash: string }) => {
    openPromptDialog(
      t('contextMenu.createTag'),
      t('contextMenu.tagName'),
      'v1.0.0',
      async (name) => {
        try {
          await createTag(workspaceId, name, entry.hash);
          toast.success(t('contextMenu.tagCreated'));
        } catch (err: unknown) {
          toast.error(t('contextMenu.failed'), { description: errMsg(err) });
        }
      },
    );
  };

  const handleCherryPick = async (entry: { hash: string }) => {
    try {
      await cherryPick(workspaceId, entry.hash);
      toast.success(t('contextMenu.cherryPicked'));
      refresh();
    } catch (err: unknown) {
      toast.error(t('contextMenu.failed'), { description: errMsg(err) });
    }
  };

  const handleCompareWithRemote = async (entry: { hash: string }) => {
    try {
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      useGitStore.setState({ diffs });
      toast.info(t('contextMenu.comparingWith', { hash: entry.hash.slice(0, 7) }));
    } catch (err: unknown) {
      toast.error(t('contextMenu.failed'), { description: errMsg(err) });
    }
  };

  const handleCompareWithMergeBase = async (entry: { hash: string }) => {
    try {
      const base = await getMergeBase(workspaceId);
      if (!base) {
        toast.error(t('contextMenu.failed'), { description: 'No merge base found' });
        return;
      }
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      useGitStore.setState({ diffs });
      toast.info(t('contextMenu.comparingWith', { hash: base.slice(0, 7) }));
    } catch (err: unknown) {
      toast.error(t('contextMenu.failed'), { description: errMsg(err) });
    }
  };

  const handleCopyCommitId = (entry: { hash: string }) => {
    navigator.clipboard.writeText(entry.hash);
    toast.success(t('contextMenu.commitIdCopied'));
  };

  const handleCopyCommitMessage = (entry: { message: string }) => {
    navigator.clipboard.writeText(entry.message);
    toast.success(t('contextMenu.commitMessageCopied'));
  };

  const handleAddToChat = (entry: { hash: string; message: string }) => {
    if (!activeChannelId) {
      toast.error(t('contextMenu.failed'), { description: 'No active channel' });
      return;
    }
    const text = `\`${entry.hash.slice(0, 7)}\` ${entry.message.split('\n')[0]}`;
    sendMessage(workspaceId, activeChannelId, text);
    toast.success(t('contextMenu.addToChat'));
  };

  const handleExplainChanges = async (entry: { hash: string; message: string }) => {
    if (!activeChannelId) {
      toast.error(t('contextMenu.failed'), { description: 'No active channel' });
      return;
    }
    const text = `Explain the changes in commit \`${entry.hash.slice(0, 7)}\`: ${entry.message.split('\n')[0]}`;
    sendMessage(workspaceId, activeChannelId, text);
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

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-t-xl bg-background">
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          {log.length > 0 ? t('titleWithCount', { count: log.length }) : t('title')}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleSync("push")}
            disabled={syncing !== null}
            className="relative p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={ahead > 0 ? t('pushNCommits', { count: ahead }) : "Push"}
          >
            {syncing === "push" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            <SyncBadge count={ahead} kind="push" />
          </button>
          <button
            onClick={() => handleSync("pull")}
            disabled={syncing !== null}
            className="relative p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={behind > 0 ? t('pullNCommits', { count: behind }) : "Pull"}
          >
            {syncing === "pull" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <SyncBadge count={behind} kind="pull" />
          </button>
          <button
            onClick={refresh}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && !log.length && (
          <div className="p-2 text-xs text-muted-foreground">{tc('loading')}</div>
        )}
        {log.map((entry, i) => {
          const isRemoteHead = i === remoteHeadIndex;
          return (
            <ContextMenu key={entry.hash}>
              <ContextMenuTrigger>
                <div
                  className={`px-2 py-1.5 border-b hover:bg-accent cursor-default ${isRemoteHead ? 'border-l-2 border-l-blue-500' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {isRemoteHead && (
                      <span title={t('remoteTrackingBranch')}><GitCommitHorizontal size={13} className="shrink-0 text-blue-500" /></span>
                    )}
                    <code className="text-xs font-mono text-blue-600 shrink-0">
                      {entry.hash.slice(0, 7)}
                    </code>
                    <span className="text-xs truncate">{entry.message.split("\n")[0]}</span>
                  </div>
                  <div className={`flex items-center gap-2 mt-0.5 ${isRemoteHead ? 'pl-[21px]' : ''}`}>
                    <span className="text-xs text-muted-foreground">{entry.author}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="min-w-48">
                <ContextMenuItem onClick={() => handleOpenChanges(entry)}>
                  {t('contextMenu.openChanges')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleOpenOnGitHub(entry)}>
                  {t('contextMenu.openOnGitHub')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleCheckout(entry)}>
                  {t('contextMenu.checkout')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCheckoutDetached(entry)}>
                  {t('contextMenu.checkoutDetached')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCreateBranch(entry)}>
                  {t('contextMenu.createBranch')}
                </ContextMenuItem>
                <ContextMenuItem onClick={handleDeleteBranch}>
                  {t('contextMenu.deleteBranch')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCreateTag(entry)}>
                  {t('contextMenu.createTag')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleCherryPick(entry)}>
                  {t('contextMenu.cherryPick')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger>{t('contextMenu.compareWith')}</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuItem onClick={() => handleCompareWithRemote(entry)}>
                      {t('contextMenu.compareWithRemote')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleCompareWithMergeBase(entry)}>
                      {t('contextMenu.compareWithMergeBase')}
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleCopyCommitId(entry)}>
                  {t('contextMenu.copyCommitId')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCopyCommitMessage(entry)}>
                  {t('contextMenu.copyCommitMessage')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleAddToChat(entry)}>
                  {t('contextMenu.addToChat')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleExplainChanges(entry)}>
                  {t('contextMenu.explainChanges')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        {!loading && !log.length && (
          <div className="p-2 text-xs text-muted-foreground">{t('noCommits')}</div>
        )}
      </div>
      <GitRemoteDialog open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen} onSubmit={handleRemoteSubmit} />
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
