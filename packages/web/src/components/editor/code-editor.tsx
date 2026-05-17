"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useCallback, useState } from "react";
import "@/lib/monaco-loader";
import { useEditorStore, isCommitDiffPath, getCommitHashFromPath } from "@/stores/editor";
import { EditorTabs } from "./editor-tabs";
import { useTheme } from "@/components/theme-provider";
import { useTranslations } from 'next-intl';
import { CommitDiffViewer } from "@/components/git/commit-diff-viewer";
import {
  getOrCreateModel,
  preloadDirectory,
  setupLanguageDefaults,
} from "@/lib/monaco-models";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import type * as Monaco from 'monaco-editor';

if (typeof window !== "undefined" && !navigator.clipboard?.write) {
  Object.defineProperty(navigator, "clipboard", {
    value: {
      ...navigator.clipboard,
      writeText: navigator.clipboard?.writeText ?? ((text: string) => Promise.resolve()),
      write: (items: ClipboardItem[]) => {
        const textItem = items[0]?.getType("text/plain");
        return textItem
          ? textItem.then((blob) => blob.text()).then((text) => navigator.clipboard.writeText(text))
          : Promise.resolve();
      },
    },
    writable: true,
    configurable: true,
  });
}

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

function EditorMenuBar({ editorRef, workspaceId, isReadOnly, onToggleReadOnly, isFullscreen, onToggleFullscreen, wordWrap, onToggleWordWrap, minimap, onToggleMinimap }: {
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  workspaceId: string;
  isReadOnly: boolean;
  onToggleReadOnly: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  minimap: boolean;
  onToggleMinimap: () => void;
}) {
  const { saveFile, activeFilePath } = useEditorStore();
  const t = useTranslations('editor');

  const exec = (action: string) => {
    editorRef.current?.trigger('menu', action, null);
  };

  return (
    <div className="flex items-center h-7 border-b bg-background shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger className="px-3 h-full text-xs hover:bg-accent outline-none cursor-default">
          {t('menuFile')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0}>
          <DropdownMenuItem onClick={() => activeFilePath && saveFile(workspaceId, activeFilePath)}>
            {t('menuSave')}
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-3 h-full text-xs hover:bg-accent outline-none cursor-default">
          {t('menuEdit')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0}>
          <DropdownMenuItem onClick={() => exec('undo')}>
            {t('menuUndo')}
            <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exec('redo')}>
            {t('menuRedo')}
            <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => exec('editor.action.clipboardCutAction')}>
            {t('menuCut')}
            <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exec('editor.action.clipboardCopyAction')}>
            {t('menuCopy')}
            <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exec('editor.action.clipboardPasteAction')}>
            {t('menuPaste')}
            <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => exec('actions.find')}>
            {t('menuFind')}
            <DropdownMenuShortcut>⌘F</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exec('editor.action.startFindReplaceAction')}>
            {t('menuReplace')}
            <DropdownMenuShortcut>⌥⌘F</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-3 h-full text-xs hover:bg-accent outline-none cursor-default">
          {t('menuView')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={0}>
          <DropdownMenuItem onClick={onToggleFullscreen}>
            {isFullscreen ? t('exitFullscreen') : t('menuFullscreen')}
            <DropdownMenuShortcut>⌃⌘F</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onToggleWordWrap}>
            {wordWrap ? t('disableWordWrap') : t('enableWordWrap')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleMinimap}>
            {minimap ? t('disableMinimap') : t('enableMinimap')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />
      <button
        onClick={onToggleReadOnly}
        className="flex items-center gap-1 px-2 h-full text-xs text-muted-foreground hover:text-foreground hover:bg-accent outline-none cursor-default"
        title={isReadOnly ? t('enableEdit') : t('disableEdit')}
      >
        {isReadOnly ? '🔒' : '✏️'}
      </button>
    </div>
  );
}

export function CodeEditor({ workspaceId }: CodeEditorProps) {
  const { openFiles, activeFilePath, updateContent, saveFile, pendingJump, clearPendingJump, commitDiffs } = useEditorStore();
  const { resolvedTheme } = useTheme();
  const t = useTranslations('editor');
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem('editor-word-wrap') === 'true');
  const [minimap, setMinimap] = useState(() => localStorage.getItem('editor-minimap') === 'true');

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const isCommitDiff = activeFilePath ? isCommitDiffPath(activeFilePath) : false;
  const commitDiffData = isCommitDiff && activeFilePath ? commitDiffs[getCommitHashFromPath(activeFilePath)] : null;

  const handleSave = useCallback(() => {
    if (activeFilePath) {
      saveFile(workspaceId, activeFilePath);
    }
  }, [activeFilePath, saveFile, workspaceId]);

  const syncReadOnly = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, readOnly: boolean) => {
    editor.updateOptions({ readOnly, domReadOnly: readOnly });

    const textarea = editor.getDomNode()?.querySelector('textarea');
    if (textarea) {
      textarea.inputMode = readOnly ? 'none' : 'text';
      textarea.tabIndex = readOnly ? -1 : 0;
      textarea.toggleAttribute('readonly', readOnly);
      textarea.toggleAttribute('disabled', readOnly);
      if (readOnly) {
        textarea.blur();
      }
    }
  }, []);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, _monaco: typeof Monaco) => {
    editorRef.current = editor;
    setupLanguageDefaults();
    syncReadOnly(editor, isReadOnly);

    editor.addCommand(
      2048 | 49, // KeyMod.CtrlCmd | KeyCode.KeyS
      () => handleSave()
    );
  }, [handleSave, isReadOnly, syncReadOnly]);

  // Sync readOnly state with Monaco editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    syncReadOnly(editor, isReadOnly);
  }, [isReadOnly, syncReadOnly]);

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

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || !isReadOnly) return;

    const preventReadOnlyFocus = (event: Event) => {
      const editor = editorRef.current;
      const target = event.target as Node | null;
      if (!editor || !target) return;
      if (!editor.getDomNode()?.contains(target)) return;

      // Only block touch events that would focus the textarea — allow mouse pointer for scrolling
      if (event.type === 'pointerdown' && 'pointerType' in event && (event as PointerEvent).pointerType === 'mouse') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) {
        event.stopImmediatePropagation();
      }
      editor.getDomNode()?.querySelector('textarea')?.blur();
    };

    const blurReadOnlyInput = (event: FocusEvent) => {
      const editor = editorRef.current;
      const target = event.target as HTMLElement | null;
      if (!editor || !target) return;
      if (!editor.getDomNode()?.contains(target)) return;
      if (target.tagName === 'TEXTAREA') {
        target.blur();
      }
    };

    container.addEventListener('touchstart', preventReadOnlyFocus, { capture: true });
    container.addEventListener('pointerdown', preventReadOnlyFocus, { capture: true });
    container.addEventListener('focusin', blurReadOnlyInput, { capture: true });

    return () => {
      container.removeEventListener('touchstart', preventReadOnlyFocus, { capture: true });
      container.removeEventListener('pointerdown', preventReadOnlyFocus, { capture: true });
      container.removeEventListener('focusin', blurReadOnlyInput, { capture: true });
    };
  }, [isReadOnly]);

  // Register model + preload directory when active file changes
  useEffect(() => {
    if (!activeFile || !activeFilePath) return;

    getOrCreateModel(workspaceId, activeFilePath, activeFile.content);
    preloadDirectory(workspaceId, activeFilePath);
  }, [activeFilePath, workspaceId, activeFile]);

  // Handle pending jump from search results
  useEffect(() => {
    if (!pendingJump || !editorRef.current) return;

    const { line, column } = pendingJump;
    const editor = editorRef.current;

    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: column || 1 });
    if (!isReadOnly) {
      editor.focus();
    }
    clearPendingJump();
  }, [pendingJump, clearPendingJump, isReadOnly]);

  const modelPath = activeFilePath
    ? `/${workspaceId}/${activeFilePath}`
    : undefined;

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
      <EditorTabs workspaceId={workspaceId} />
      <EditorMenuBar editorRef={editorRef} workspaceId={workspaceId} isReadOnly={isReadOnly} onToggleReadOnly={() => setIsReadOnly(r => !r)} isFullscreen={isFullscreen} onToggleFullscreen={() => setIsFullscreen(f => !f)} wordWrap={wordWrap} onToggleWordWrap={() => { const v = !wordWrap; setWordWrap(v); localStorage.setItem('editor-word-wrap', String(v)); }} minimap={minimap} onToggleMinimap={() => { const v = !minimap; setMinimap(v); localStorage.setItem('editor-minimap', String(v)); }} />
      <div ref={editorContainerRef} className="flex-1 min-h-0">
        {isCommitDiff && commitDiffData ? (
          <CommitDiffViewer diffs={commitDiffData.diffs} message={commitDiffData.message} />
        ) : activeFile ? (
          <MonacoEditor
            height="100%"
            language={getLanguage(activeFile.path)}
            value={activeFile.content}
            path={modelPath}
            onChange={(value) => updateContent(activeFile.path, value || "")}
            onMount={handleMount}
            options={{
              fontSize: 13,
              minimap: { enabled: minimap },
              scrollBeyondLastLine: false,
              padding: { top: 8 },
              renderLineHighlight: "gutter",
              readOnly: isReadOnly,
              domReadOnly: isReadOnly,
              wordWrap: wordWrap ? 'on' : 'off',
            }}
            theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t('openFileToEdit')}
          </div>
        )}
      </div>
    </div>
  );
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rs: "rust",
    go: "go",
    sql: "sql",
    sh: "shell",
    bash: "shell",
  };
  return map[ext || ""] || "plaintext";
}
