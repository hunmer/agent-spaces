"use client";

import { useCallback } from "react";
import { monacoBuiltinActions } from "@/lib/monaco-builtin-actions";
import { applyRegisteredActions } from "@/lib/monaco-action-registry";
import {
  getModel,
  getModelUri,
  getOrCreateModel,
} from "@/lib/monaco-models";
import { startTypeScriptLanguageClient, stopTypeScriptLanguageClient } from "@/lib/monaco-language-client";
import {
  useEditorStore,
  isCommitDiffPath,
  getCommitHashFromPath,
  getMediaType,
} from "@/stores/editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { EditorTabs } from "./editor-tabs";
import { registerNavigationActions } from "./code-editor-navigation";
import { CommonCodeEditor } from "./common-code-editor";
import type * as Monaco from "monaco-editor";

interface CodeEditorProps {
  workspaceId: string;
}

let _monacoCanceledHandlerRegistered = false;
function suppressMonacoCanceled() {
  if (_monacoCanceledHandlerRegistered || typeof window === "undefined") return;
  _monacoCanceledHandlerRegistered = true;
  window.addEventListener("unhandledrejection", (e) => {
    if (e.reason?.name === "Canceled" || String(e.reason) === "Canceled") {
      e.preventDefault();
    }
  });
}

export function CodeEditor({ workspaceId }: CodeEditorProps) {
  suppressMonacoCanceled();
  const {
    openFiles,
    modifiedFileContents,
    activeFilePath,
    updateContent,
    saveFile,
    refreshFile,
    jumpToPosition,
    pendingJump,
    clearPendingJump,
    commitDiffs,
  } = useEditorStore();
  const workspaceRoot = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.boundDirs?.[0]);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const activeContent = activeFile ? modifiedFileContents[activeFile.path] ?? activeFile.content : "";
  const isCommitDiff = activeFilePath ? isCommitDiffPath(activeFilePath) : false;
  const commitDiffData = isCommitDiff && activeFilePath ? commitDiffs[getCommitHashFromPath(activeFilePath)] : null;
  const mediaType = activeFile?.mediaType ?? (activeFilePath ? getMediaType(activeFilePath) : null);
  const mediaUrl = activeFilePath && mediaType
    ? `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(activeFilePath)}&raw=true`
    : null;
  const modelPath = activeFilePath
    ? getModelUri(workspaceId, activeFilePath, workspaceRoot).toString()
    : undefined;

  const handleSave = useCallback(() => {
    if (activeFilePath) {
      saveFile(workspaceId, activeFilePath);
    }
  }, [activeFilePath, saveFile, workspaceId]);

  const handleRefreshActiveFile = useCallback(() => {
    if (activeFilePath) {
      refreshFile(workspaceId, activeFilePath);
    }
  }, [activeFilePath, refreshFile, workspaceId]);

  const handleRegisterNavigation = useCallback((
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
    disposables: Monaco.IDisposable[],
  ) => {
    registerNavigationActions(editor, monaco, disposables, {
      activeFilePath,
      workspaceId,
      workspaceRoot,
      jumpToPosition,
    });
  }, [activeFilePath, jumpToPosition, workspaceId, workspaceRoot]);

  const handleStartLanguageClient = useCallback(() => {
    if (workspaceRoot) {
      startTypeScriptLanguageClient(workspaceId, workspaceRoot);
    }
  }, [workspaceId, workspaceRoot]);

  const handleStopLanguageClient = useCallback(() => {
    stopTypeScriptLanguageClient(workspaceId);
  }, [workspaceId]);

  return (
    <CommonCodeEditor
      activeFile={activeFile}
      activeFilePath={activeFilePath}
      activeContent={activeContent}
      modelPath={modelPath}
      mediaType={mediaType}
      mediaUrl={mediaUrl}
      isCommitDiff={isCommitDiff}
      commitDiffData={commitDiffData}
      pendingJump={pendingJump}
      workspaceIdForMarkdown={workspaceId}
      tabs={<EditorTabs workspaceId={workspaceId} />}
      onChange={updateContent}
      onSave={handleSave}
      onRefreshActiveFile={handleRefreshActiveFile}
      onClearPendingJump={clearPendingJump}
      onGetExpectedModelPath={(path) => getModelUri(workspaceId, path, workspaceRoot).path}
      onGetModel={(path) => getModel(workspaceId, path, workspaceRoot)}
      onEnsureModel={(path, content) => getOrCreateModel(workspaceId, path, content, workspaceRoot)}
      onRegisterNavigation={handleRegisterNavigation}
      onStartLanguageClient={handleStartLanguageClient}
      onStopLanguageClient={handleStopLanguageClient}
      onRunBuiltinAction={(actionId, editor) => {
        const action = monacoBuiltinActions.find((item) => item.id === actionId);
        action?.run(editor, { workspaceId, workspaceRoot });
      }}
      onApplyRegisteredActions={(editor) => applyRegisteredActions(editor, { workspaceId, workspaceRoot })}
    />
  );
}
