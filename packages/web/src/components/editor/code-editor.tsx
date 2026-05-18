"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useCallback, useState } from "react";
import "@/lib/monaco-loader";
import "@/lib/monaco-builtin-actions";
import "@/components/editor/code-editor-clipboard";
import { applyRegisteredActions } from "@/lib/monaco-action-registry";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEditorStore, isCommitDiffPath, getCommitHashFromPath } from "@/stores/editor";
import { EditorTabs } from "./editor-tabs";
import { EditorMenuBar } from "./code-editor-menu-bar";
import { useTheme } from "@/components/theme-provider";
import { useTranslations } from 'next-intl';
import { CommitDiffViewer } from "@/components/git/commit-diff-viewer";
import { useWorkspaceStore } from "@/stores/workspace";
import { useCodeFavoritesStore } from "@/stores/code-favorites";
import {
  getModelUri,
  getOrCreateModel,
} from "@/lib/monaco-models";
import { startTypeScriptLanguageClient, stopTypeScriptLanguageClient } from "@/lib/monaco-language-client";
import {
  getFilePathFromModelUri,
  getLanguage,
} from "./code-editor-utils";
import { registerNavigationActions } from "./code-editor-navigation";
import { collapseEditorSelection } from "./code-editor-mobile";
import { useMobileReadonlyOverlay } from "./useMobileReadonlyOverlay";
import { MobileReadonlyOverlay } from "./code-editor-mobile-overlay";
import type * as Monaco from 'monaco-editor';

function EditorLoadingFallback() {
  const t = useTranslations('editor');
  return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{t('loadingEditor')}</div>;
}

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false, loading: () => <EditorLoadingFallback /> }
);

interface CodeEditorProps {
  workspaceId: string;
}

let _monacoCanceledHandlerRegistered = false;
function suppressMonacoCanceled() {
  if (_monacoCanceledHandlerRegistered || typeof window === 'undefined') return;
  _monacoCanceledHandlerRegistered = true;
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason?.name === 'Canceled' || String(e.reason) === 'Canceled') {
      e.preventDefault();
    }
  });
}

export function CodeEditor({ workspaceId }: CodeEditorProps) {
  suppressMonacoCanceled();
  const { openFiles, modifiedFileContents, activeFilePath, updateContent, saveFile, refreshFile, jumpToPosition, pendingJump, clearPendingJump, commitDiffs } = useEditorStore();
  const { resolvedTheme } = useTheme();
  const t = useTranslations('editor');
  const isMobile = useIsMobile();
  const workspaceRoot = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.boundDirs?.[0]);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const navigationDisposablesRef = useRef<Monaco.IDisposable[]>([]);
  const actionRegistryDisposablesRef = useRef<Monaco.IDisposable[]>([]);
  const favoriteDecorationsRef = useRef<string[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem('editor-word-wrap') === 'true');
  const [minimap, setMinimap] = useState(() => localStorage.getItem('editor-minimap') === 'true');
  const [editorReadyTick, setEditorReadyTick] = useState(0);
  const [jumpRetryTick, setJumpRetryTick] = useState(0);

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const activeContent = activeFile ? modifiedFileContents[activeFile.path] ?? activeFile.content : "";
  const isCommitDiff = activeFilePath ? isCommitDiffPath(activeFilePath) : false;
  const commitDiffData = isCommitDiff && activeFilePath ? commitDiffs[getCommitHashFromPath(activeFilePath)] : null;

  const mobile = useMobileReadonlyOverlay({
    editorRef,
    monacoRef,
    activeContent,
    workspaceId,
    workspaceRoot,
    isMobile,
    isReadOnly,
    isCommitDiff,
    hasActiveFile: Boolean(activeFile),
    editorReadyTick,
    wordWrap,
  });

  const handleSave = useCallback(() => {
    if (activeFilePath) {
      saveFile(workspaceId, activeFilePath);
    }
  }, [activeFilePath, saveFile, workspaceId]);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const syncReadOnly = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, readOnly: boolean) => {
    editor.updateOptions({ readOnly, domReadOnly: readOnly });
  }, []);

  const registerNavigation = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    registerNavigationActions(editor, monaco, navigationDisposablesRef.current, {
      activeFilePath,
      workspaceId,
      workspaceRoot,
      jumpToPosition,
    });
  }, [activeFilePath, jumpToPosition, workspaceId, workspaceRoot]);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, _monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = _monaco;
    if (workspaceRoot) {
      startTypeScriptLanguageClient(workspaceId, workspaceRoot);
    }
    syncReadOnly(editor, isReadOnly);
    registerNavigation(editor, _monaco);

    for (const d of actionRegistryDisposablesRef.current) d.dispose();
    actionRegistryDisposablesRef.current = applyRegisteredActions(editor, { workspaceId, workspaceRoot });

    setEditorReadyTick((tick) => tick + 1);

    editor.addAction({
      id: 'agentSpaces.saveFile',
      label: 'Save File',
      keybindings: [2048 | 49], // KeyMod.CtrlCmd | KeyCode.KeyS
      run: () => handleSaveRef.current(),
    });
  }, [isReadOnly, registerNavigation, syncReadOnly, workspaceId, workspaceRoot]);

  useEffect(() => {
    if (!editorRef.current || !workspaceRoot) return;
    startTypeScriptLanguageClient(workspaceId, workspaceRoot);
  }, [workspaceId, workspaceRoot]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    registerNavigation(editorRef.current, monacoRef.current);
  }, [registerNavigation]);

  useEffect(() => {
    return () => stopTypeScriptLanguageClient(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      for (const disposable of navigationDisposablesRef.current) {
        disposable.dispose();
      }
      navigationDisposablesRef.current = [];
      for (const d of actionRegistryDisposablesRef.current) d.dispose();
      actionRegistryDisposablesRef.current = [];
      favoriteDecorationsRef.current = [];
    };
  }, []);

  // Apply favorite decorations for current file
  const favorites = useCodeFavoritesStore((s) => s.favorites);
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeFilePath) {
      if (editor) favoriteDecorationsRef.current = editor.deltaDecorations(favoriteDecorationsRef.current, []);
      return;
    }
    const matched = favorites.filter(
      (f) => f.path === activeFilePath && f.workspaceId === workspaceId,
    );
    if (matched.length === 0) {
      favoriteDecorationsRef.current = editor.deltaDecorations(favoriteDecorationsRef.current, []);
      return;
    }
    const decorations = matched.map((f) => ({
      range: new monaco.Range(f.line, 1, f.endLine || f.line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'favorite-glyph',
        glyphMarginHoverMessage: { value: f.label || `${f.path}:${f.line}` },
        className: 'favorite-line-bg',
      },
    }));
    favoriteDecorationsRef.current = editor.deltaDecorations(favoriteDecorationsRef.current, decorations);
  }, [activeFilePath, favorites, workspaceId, editorReadyTick]);

  // Poll for external file changes (skip if user has unsaved edits)
  useEffect(() => {
    if (!activeFilePath || !activeFile || activeFile.modified || isCommitDiff) return;
    const timer = setInterval(() => {
      refreshFile(workspaceId, activeFilePath);
    }, 3000);
    return () => clearInterval(timer);
  }, [activeFilePath, activeFile?.modified, isCommitDiff, workspaceId, refreshFile]);

  // Sync readOnly state with Monaco editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    syncReadOnly(editor, isReadOnly);
  }, [isReadOnly, syncReadOnly]);

  useEffect(() => {
    if (!mobile.pendingNavigationSelectionCleanup.current) return;
    window.setTimeout(() => {
      if (!mobile.pendingNavigationSelectionCleanup.current) return;
      collapseEditorSelection(editorRef.current);
      mobile.closeMobileSelectionMode();
    }, 0);
  }, [activeFilePath, editorReadyTick, mobile]);

  // Sync wordWrap with Monaco editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' });
  }, [wordWrap]);

  // Sync minimap with Monaco editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ minimap: { enabled: minimap } });
  }, [minimap]);

  // Register model when active file changes
  useEffect(() => {
    if (!activeFile || !activeFilePath) return;

    getOrCreateModel(workspaceId, activeFilePath, activeContent, workspaceRoot);
  }, [activeFilePath, activeContent, workspaceId, workspaceRoot]);

  // Handle pending jump from search results
  useEffect(() => {
    if (!pendingJump || !activeFilePath || pendingJump.path !== activeFilePath || !editorRef.current) return;

    const { line, column, endLine, endColumn, path } = pendingJump;
    const editor = editorRef.current;
    const model = editor.getModel();
    const expectedModelPath = getModelUri(workspaceId, path, workspaceRoot).path;
    if (!model || model.uri.path !== expectedModelPath) {
      const retryTimer = window.setTimeout(() => {
        setJumpRetryTick((tick) => tick + 1);
      }, 30);
      return () => window.clearTimeout(retryTimer);
    }

    const lineNumber = Math.min(Math.max(1, line), model.getLineCount());
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const columnNumber = Math.min(Math.max(1, column || 1), maxColumn);

    const endLineNumber = endLine ? Math.min(Math.max(1, endLine), model.getLineCount()) : lineNumber;
    const endColumnNumber = endColumn
      ? Math.min(Math.max(1, endColumn), model.getLineMaxColumn(endLineNumber))
      : columnNumber;
    const selection = {
      startLineNumber: lineNumber,
      startColumn: columnNumber,
      endLineNumber,
      endColumn: endColumnNumber,
    };

    editor.setSelection(selection);
    editor.setPosition({ lineNumber, column: columnNumber });
    editor.revealLineInCenter(lineNumber);
    const highlights = editor.createDecorationsCollection([{
      range: selection,
      options: {
        className: 'symbolHighlight',
        stickiness: 1,
      },
    }]);
    window.setTimeout(() => highlights.clear(), 700);
    if (!isReadOnly) {
      editor.focus();
    }
    clearPendingJump();
  }, [pendingJump, activeFilePath, workspaceId, workspaceRoot, editorReadyTick, jumpRetryTick, clearPendingJump, isReadOnly]);

  const modelPath = activeFilePath
    ? getModelUri(workspaceId, activeFilePath, workspaceRoot).toString()
    : undefined;

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
      <EditorTabs workspaceId={workspaceId} />
      <EditorMenuBar editorRef={editorRef} workspaceId={workspaceId} isReadOnly={isReadOnly} onToggleReadOnly={() => setIsReadOnly(r => !r)} isFullscreen={isFullscreen} onToggleFullscreen={() => setIsFullscreen(f => !f)} wordWrap={wordWrap} onToggleWordWrap={() => { const v = !wordWrap; setWordWrap(v); localStorage.setItem('editor-word-wrap', String(v)); }} minimap={minimap} onToggleMinimap={() => { const v = !minimap; setMinimap(v); localStorage.setItem('editor-minimap', String(v)); }} />
      <div
        ref={editorContainerRef}
        className="relative flex-1 min-h-0"
        {...mobile.containerProps}
      >
        {isCommitDiff && commitDiffData ? (
          <CommitDiffViewer diffs={commitDiffData.diffs} message={commitDiffData.message} />
        ) : activeFile ? (
          <>
            <MonacoEditor
              height="100%"
              language={getLanguage(activeFile.path)}
              value={activeContent}
              path={modelPath}
              onChange={(value, event) => {
                if (event.isFlush) return;
                const v = value || "";
                const modelFilePath = getFilePathFromModelUri(
                  editorRef.current?.getModel()?.uri,
                  workspaceId,
                  workspaceRoot,
                );
                if (!modelFilePath || modelFilePath !== activeFile.path) return;
                updateContent(modelFilePath, v);
              }}
              onMount={handleMount}
              options={{
                fontSize: 13,
                minimap: { enabled: minimap },
                scrollBeyondLastLine: false,
                glyphMargin: true,
                lineNumbersMinChars: 3,
                padding: { top: 8 },
                renderLineHighlight: "gutter",
                readOnly: isReadOnly,
                domReadOnly: isReadOnly,
                wordWrap: wordWrap ? 'on' : 'off',
                gotoLocation: {
                  multipleDefinitions: 'goto',
                  multipleTypeDefinitions: 'goto',
                  multipleDeclarations: 'goto',
                  multipleImplementations: 'goto',
                  multipleReferences: 'goto',
                },
              }}
              theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
            />
            {mobile.showMobileReadonlyOverlay ? (
              <MobileReadonlyOverlay
                activeContent={activeContent}
                wordWrap={wordWrap}
                mobileSelectionMode={mobile.mobileSelectionMode}
                mobileReadonlyMenu={mobile.mobileReadonlyMenu}
                mobileSelectionPreMetrics={mobile.mobileSelectionPreMetrics}
                mobileSelectionPreRef={mobile.mobileSelectionPreRef}
                mobileReadonlyMenuRef={mobile.mobileReadonlyMenuRef}
                onContextMenu={mobile.handleMobileSelectionContextMenu}
                onEnterSelectionMode={mobile.enterMobileSelectionMode}
                onCloseSelectionMode={mobile.closeMobileSelectionMode}
                onCopySelection={mobile.copyMobileSelection}
                onRunEditorAction={mobile.runMobileEditorAction}
                onRunBuiltinAction={mobile.runMobileBuiltinAction}
              />
            ) : null}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t('openFileToEdit')}
          </div>
        )}
      </div>
    </div>
  );
}
