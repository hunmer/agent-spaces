import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FileNode } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ChatPanel } from '@/components/ui/chat-panel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { MINI_APP_HIDDEN_FIELDS } from '@/components/sidebar/agent-shared';
import { CommonEditorPanel } from '@/components/editor/editor-panel';
import { CommonCodeEditor } from '@/components/editor/common-code-editor';
import { type OpenFile } from '@/stores/editor';
import { getModel, getModelUri, getOrCreateModel } from '@/lib/monaco-models';
import { Loader2, Sparkles, Settings2, Eraser, FilesIcon, Trash2, RotateCcw, MessageSquareText, UploadIcon } from 'lucide-react';
import { miniAppConfigToAgentPreset, agentPresetToMiniAppConfig } from '../mini-app-agent-adapter';
import { useMiniAppAgentChat } from './use-agent-chat';

/** 该模块共享的 chat hook 返回类型。 */
type MiniAppAgentChat = ReturnType<typeof useMiniAppAgentChat>;

/** Agent 设置 + 清空确认弹窗（两种形态共用）。 */
export function MiniAppAgentDialogs({ projectId, chat }: { projectId: string; chat: MiniAppAgentChat }) {
  const t = useTranslations('mini-apps');
  const {
    settingsOpen, setSettingsOpen, settingsLoading, settingsDraft, originalConfig, handleSettingsSaved,
    clearOpen, setClearOpen, handleClear,
  } = chat;
  return (
    <>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex max-h-[86vh] min-w-[60vw] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{t('agent.settingsTitle')}</DialogTitle>
          </DialogHeader>
          {settingsLoading || !settingsDraft || !originalConfig ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('agent.loading')}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AgentEditor
                agent={settingsDraft}
                onSaved={handleSettingsSaved}
                onBack={() => setSettingsOpen(false)}
                showFooter
                hiddenFields={MINI_APP_HIDDEN_FIELDS}
                commit={async (draft) => {
                  const cfg = agentPresetToMiniAppConfig(draft, originalConfig);
                  const updated = await sdk.miniApp.updateAgent(projectId, cfg.id, cfg);
                  return miniAppConfigToAgentPreset(updated);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agent.clearTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('agent.clearConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('agent.clearCancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleClear}>{t('agent.clearAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MiniAppAgentFilesDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [modifiedFileContents, setModifiedFileContents] = useState<Record<string, string>>({});
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reloadTree = useCallback(async () => {
    setLoading(true);
    try {
      setTree(await sdk.miniApp.getAgentFilesTree(projectId, '', 10, 'preview'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const uploadFiles = useCallback(async (targetPath: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    if (targetPath) formData.append('folder', targetPath);
    formData.append('scope', 'preview');
    await sdk.miniApp.uploadAgentFiles(projectId, formData);
    await reloadTree();
  }, [projectId, reloadTree]);

  const openFile = useCallback(async (path: string) => {
    const existing = openFiles.find((file) => file.path === path);
    if (existing) {
      setActiveFilePath(path);
      return;
    }

    const { content } = await sdk.miniApp.readAgentFile(projectId, path, 'preview');
    setOpenFiles((prev) => [...prev, { path, name: path.split('/').pop() || path, content, modified: false }]);
    setActiveFilePath(path);
  }, [openFiles, projectId]);

  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activeFilePath),
    [activeFilePath, openFiles],
  );
  const activeContent = activeFile ? modifiedFileContents[activeFile.path] ?? activeFile.content : '';
  const modelPath = activeFilePath
    ? getModelUri(`mini-app-preview-agent-files:${projectId}`, activeFilePath).toString()
    : undefined;

  const handleChange = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => prev.map((file) => (
      file.path === path ? { ...file, modified: file.content.replace(/\r\n?/g, '\n') !== content.replace(/\r\n?/g, '\n') } : file
    )));
    setModifiedFileContents((prev) => {
      const file = openFiles.find((item) => item.path === path);
      if (!file) return prev;
      const next = { ...prev };
      if (file.content.replace(/\r\n?/g, '\n') === content.replace(/\r\n?/g, '\n')) delete next[path];
      else next[path] = content;
      return next;
    });
  }, [openFiles]);

  const handleSave = useCallback(async () => {
    if (!activeFilePath || !activeFile) return;
    const content = modifiedFileContents[activeFilePath] ?? activeFile.content;
    await sdk.miniApp.writeAgentFile(projectId, activeFilePath, content, 'preview');
    setOpenFiles((prev) => prev.map((file) => (
      file.path === activeFilePath ? { ...file, content, modified: false } : file
    )));
    setModifiedFileContents((prev) => {
      const next = { ...prev };
      delete next[activeFilePath];
      return next;
    });
    await reloadTree();
  }, [activeFile, activeFilePath, modifiedFileContents, projectId, reloadTree]);

  const handleRefreshActiveFile = useCallback(async () => {
    if (!activeFilePath || activeFile?.modified) return;
    const { content } = await sdk.miniApp.readAgentFile(projectId, activeFilePath, 'preview');
    setOpenFiles((prev) => prev.map((file) => (
      file.path === activeFilePath ? { ...file, content } : file
    )));
  }, [activeFile?.modified, activeFilePath, projectId]);

  const api = useMemo(() => ({
    tree,
    treeLoading: loading,
    loadingDirs: new Set<string>(),
    openFiles,
    loadTree: reloadTree,
    loadDirectory: reloadTree,
    openFile,
    searchFiles: async (query: string) => {
      const lower = query.toLowerCase();
      const results: FileNode[] = [];
      const walk = (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.name.toLowerCase().includes(lower)) results.push(node);
          if (node.children) walk(node.children);
        }
      };
      walk(tree);
      return results;
    },
    saveEmptyFile: async (path: string) => {
      await sdk.miniApp.writeAgentFile(projectId, path, '', 'preview');
      await reloadTree();
    },
    deletePath: async (path: string) => {
      await sdk.miniApp.deleteAgentFile(projectId, path, 'preview');
      await reloadTree();
    },
    renamePath: async (oldPath: string, newPath: string) => {
      await sdk.miniApp.renameAgentFile(projectId, oldPath, newPath, 'preview');
      await reloadTree();
    },
    copyPath: async (_srcPath: string, _destPath: string) => {},
    uploadFiles,
  }), [loading, openFile, openFiles, projectId, reloadTree, tree, uploadFiles]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (nextOpen) void reloadTree();
      }}>
        <DialogContent className="flex h-[80vh] !w-[80vw] !max-w-[80vw] flex-col overflow-hidden p-0">
          <DialogHeader className="flex h-12 shrink-0 flex-row items-center gap-2 border-b px-5 py-0">
            <DialogTitle className="min-w-0 flex-1 truncate">agent_files/preview</DialogTitle>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.currentTarget.value = '';
                if (files.length) void uploadFiles('', files);
              }}
            />
            <Button type="button" variant="ghost" size="icon" className="size-7 mr-8" onClick={() => inputRef.current?.click()}>
              <UploadIcon className="size-3.5" />
            </Button>
          </DialogHeader>
          <div className="flex min-h-0 flex-1">
            <aside className="w-80 shrink-0 border-r">
              <CommonEditorPanel
                storageKey={`mini-app-preview-agent-files:${projectId}`}
                variant="project"
                api={api}
                allowDragUpload
              />
            </aside>
            <main className="min-w-0 flex-1">
              <CommonCodeEditor
                activeFile={activeFile}
                activeFilePath={activeFilePath}
                activeContent={activeContent}
                modelPath={modelPath}
                mediaType={null}
                mediaUrl={null}
                isCommitDiff={false}
                commitDiffData={null}
                pendingJump={null}
                onChange={handleChange}
                onSave={handleSave}
                onRefreshActiveFile={handleRefreshActiveFile}
                onClearPendingJump={() => undefined}
                onGetExpectedModelPath={(path) => getModelUri(`mini-app-preview-agent-files:${projectId}`, path).path}
                onGetModel={(path) => getModel(`mini-app-preview-agent-files:${projectId}`, path)}
                onEnsureModel={(path, content) => getOrCreateModel(`mini-app-preview-agent-files:${projectId}`, path, content)}
                onRegisterNavigation={() => undefined}
              />
            </main>
          </div>
        </DialogContent>
      </Dialog>
  );
}

/** ChatPanel 顶部工具区（切换会话 / agent / 设置），popover 与 dock 共用。 */
export function MiniAppAgentHeaderActions({ chat }: { chat: MiniAppAgentChat }) {
  const t = useTranslations('mini-apps');
  const { agentId, openSettings,
    sessions, sessionId, handleSwitchSession, handleNewSession, handleDeleteSession } = chat;
  return (
    <>
      {/* 会话切换 */}
      {agentId && (
        <Select value={sessionId} onValueChange={(v) => v === '__new__' ? handleNewSession() : handleSwitchSession(v ?? '')}>
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue className="min-w-0">
              <span className="truncate">
                {sessionId
                  ? (sessions.find((s) => s.id === sessionId)?.title ?? t('agent.sessionUntitled'))
                  : t('agent.sessionNew')}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-auto max-w-[220px]">
            <SelectItem value="__new__">{t('agent.sessionNew')}</SelectItem>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id} className="min-w-0">
                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{s.title}</span>
                  <button
                    type="button"
                    className="ml-auto inline-flex shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t('agent.delete')}
                    aria-label={t('agent.delete')}
                    // 阻止 Select 关闭并触发删除
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSession(s.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </SelectItem>
            ))}
            {sessions.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{t('agent.sessionEmpty')}</div>
            )}
          </SelectContent>
        </Select>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full hover:bg-background/50"
        onClick={openSettings}
        disabled={!agentId}
        title={t('agent.settings')}
        aria-label={t('agent.settings')}
      >
        <Settings2 className="h-4 w-4" />
      </Button>
    </>
  );
}

/**
 * ChatPanel 头部菜单 dropdown 内容（清空消息 / 查看文件列表 / 重置 agents.json）。
 * 自管理 FilesDialog 与 Reset 确认框的开关状态。
 */
export function MiniAppAgentMenu({ chat }: { chat: MiniAppAgentChat }) {
  const t = useTranslations('mini-apps');
  const { projectId, agentFilesEnabled, agentId, sending, messages, setClearOpen, resetOpen, setResetOpen, handleResetAgents } = chat;
  const [filesOpen, setFilesOpen] = useState(false);
  const clearDisabled = !agentId || sending || messages.length === 0;
  return (
    <>
      <DropdownMenuItem
        disabled={clearDisabled}
        closeOnClick={false}
        onClick={() => setClearOpen(true)}
      >
        <Eraser className="mr-2 h-4 w-4" />
        {t('agent.clear')}
      </DropdownMenuItem>
      {agentFilesEnabled ? (
        <DropdownMenuItem closeOnClick={false} onClick={() => setFilesOpen(true)}>
          <FilesIcon className="mr-2 h-4 w-4" />
          {t('agent.files')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-amber-600 focus:text-amber-600 dark:text-amber-400"
        closeOnClick={false}
        onClick={() => setResetOpen(true)}
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        {t('agent.resetAgents')}
      </DropdownMenuItem>

      {/* 文件列表弹窗 */}
      {agentFilesEnabled ? (
        <MiniAppAgentFilesDialog projectId={projectId} open={filesOpen} onOpenChange={setFilesOpen} />
      ) : null}

      {/* 重置确认框 */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agent.resetAgents')}</AlertDialogTitle>
            <AlertDialogDescription>{t('agent.resetAgentsConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('agent.resetAgentsCancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleResetAgents}>{t('agent.resetAgentsAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** AI 助手 Popover 形态（按钮触发，浮层 ChatPanel）。 */
export function MiniAppAgentPopover({ projectId }: { projectId: string }) {
  const t = useTranslations('mini-apps');
  const chat = useMiniAppAgentChat(projectId);
  const [open, setOpen] = useState(false);

  // 打开时拉取一次历史（用 ref 持有函数，避免其引用变化触发重跑覆盖流式输出）
  const loadHistoryRef = useRef(chat.loadHistory);
  loadHistoryRef.current = chat.loadHistory;
  useEffect(() => { if (open) loadHistoryRef.current(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { messages, input, setInput, sending, handleSend, handleStop, current, suggestions, agentFileMentions,
    handleAnswerAskUserQuestion, handleRerunTool, handleDeleteMessage, handleRegenerateMessage, sessionDetailForMessage, introduction,
    agents, agentId, setAgentId } = chat;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('agent.open')} />}>
        <Sparkles className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 border-0 bg-transparent shadow-none">
        <ChatPanel
          onClose={() => setOpen(false)}
          agent={{
            id: agentId,
            name: current?.name ?? 'Agent',
            avatar: current?.avatar,
            status: sending ? 'busy' : 'online',
          }}
          agents={agents.length > 1 ? agents : undefined}
          onAgentChange={(a) => a.id && setAgentId(a.id)}
          messages={messages}
          sending={sending}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          onAnswerAskUserQuestion={handleAnswerAskUserQuestion}
          onRerunTool={handleRerunTool}
          onDeleteMessage={handleDeleteMessage}
          onRegenerateMessage={handleRegenerateMessage}
          sessionDetailForMessage={sessionDetailForMessage}
          inputPlaceholder={t('agent.inputPlaceholder')}
          suggestions={suggestions}
          introduction={introduction}
          mentionFiles={agentFileMentions}
          headerActions={<MiniAppAgentHeaderActions chat={chat} />}
          menuItems={<MiniAppAgentMenu chat={chat} />}
        />
      </PopoverContent>
      <MiniAppAgentDialogs projectId={projectId} chat={chat} />
    </Popover>
  );
}

/** AI 助手 Dock 形态（右侧固定侧栏 ChatPanel）。 */
export function MiniAppAgentDock({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useTranslations('mini-apps');
  const chat = useMiniAppAgentChat(projectId);

  // dock 常驻：仅在 mount 时拉一次历史（agent 切换由 hook 内部 effect 处理）
  const loadHistoryRef = useRef(chat.loadHistory);
  loadHistoryRef.current = chat.loadHistory;
  useEffect(() => { loadHistoryRef.current(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { messages, input, setInput, sending, handleSend, handleStop, current, suggestions, agentFileMentions,
    handleAnswerAskUserQuestion, handleRerunTool, handleDeleteMessage, handleRegenerateMessage, sessionDetailForMessage, introduction,
    agents, agentId, setAgentId } = chat;

  return (
    <div className="flex h-full w-full flex-col border-l bg-background">
        <ChatPanel
          onClose={onClose}
          fillContainer
          className="h-full w-full rounded-none border-0 shadow-none ring-0"
          agent={{
            id: agentId,
            name: current?.name ?? 'Agent',
            avatar: current?.avatar,
            status: sending ? 'busy' : 'online',
          }}
          agents={agents.length > 1 ? agents : undefined}
          onAgentChange={(a) => a.id && setAgentId(a.id)}
          messages={messages}
        sending={sending}
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        onAnswerAskUserQuestion={handleAnswerAskUserQuestion}
        onRerunTool={handleRerunTool}
        onDeleteMessage={handleDeleteMessage}
        onRegenerateMessage={handleRegenerateMessage}
        introduction={introduction}
        sessionDetailForMessage={sessionDetailForMessage}
        inputPlaceholder={t('agent.inputPlaceholder')}
        suggestions={suggestions}
        mentionFiles={agentFileMentions}
        headerActions={<MiniAppAgentHeaderActions chat={chat} />}
        menuItems={<MiniAppAgentMenu chat={chat} />}
      />
      <MiniAppAgentDialogs projectId={projectId} chat={chat} />
    </div>
  );
}
