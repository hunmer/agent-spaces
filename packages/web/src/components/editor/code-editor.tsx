"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useCallback, useState } from "react";
import "@/lib/monaco-loader";
import { useEditorStore, isCommitDiffPath, getCommitHashFromPath } from "@/stores/editor";
import { EditorTabs } from "./editor-tabs";
import { useTheme } from "@/components/theme-provider";
import { useTranslations } from 'next-intl';
import { CommitDiffViewer } from "@/components/git/commit-diff-viewer";
import { useWorkspaceStore } from "@/stores/workspace";
import {
  getModelUri,
  getOrCreateModel,
} from "@/lib/monaco-models";
import { startTypeScriptLanguageClient, stopTypeScriptLanguageClient } from "@/lib/monaco-language-client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import type * as Monaco from 'monaco-editor';

function getFilePathFromModelPath(modelPath: string | undefined, workspaceId: string): string | null {
  if (!modelPath) return null;
  const workspacePrefix = `/workspace/${workspaceId}/`;
  if (modelPath.startsWith(workspacePrefix)) {
    return decodeURIComponent(modelPath.slice(workspacePrefix.length));
  }
  const plainPrefix = `/${workspaceId}/`;
  if (modelPath.startsWith(plainPrefix)) {
    return decodeURIComponent(modelPath.slice(plainPrefix.length));
  }
  return null;
}

function getFilePathFromModelUri(
  modelUri: Monaco.Uri | undefined,
  workspaceId: string,
  workspaceRoot?: string,
): string | null {
  if (!modelUri) return null;

  const rootPath = workspaceRoot?.replace(/\/+$/, '');
  if (rootPath && modelUri.path.startsWith(`${rootPath}/`)) {
    return decodeURIComponent(modelUri.path.slice(rootPath.length + 1));
  }

  return getFilePathFromModelPath(modelUri.path, workspaceId);
}

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
  const { openFiles, modifiedFileContents, activeFilePath, updateContent, saveFile, refreshFile, jumpToPosition, pendingJump, clearPendingJump, commitDiffs } = useEditorStore();
  const { resolvedTheme } = useTheme();
  const t = useTranslations('editor');
  const workspaceRoot = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.boundDirs?.[0]);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const navigationDisposablesRef = useRef<Monaco.IDisposable[]>([]);
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

  const handleSave = useCallback(() => {
    if (activeFilePath) {
      saveFile(workspaceId, activeFilePath);
    }
  }, [activeFilePath, saveFile, workspaceId]);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

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

  const registerNavigationActions = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    for (const disposable of navigationDisposablesRef.current) {
      disposable.dispose();
    }
    navigationDisposablesRef.current = [];

    navigationDisposablesRef.current.push(
      monaco.editor.registerEditorOpener({
        openCodeEditor: async (source, resource, selectionOrPosition) => {
          const targetPath = getFilePathFromModelUri(resource, workspaceId, workspaceRoot);
          if (!targetPath) return false;

          const sourcePath = getFilePathFromModelUri(source.getModel()?.uri, workspaceId, workspaceRoot);
          const line = selectionOrPosition && 'lineNumber' in selectionOrPosition
            ? selectionOrPosition.lineNumber
            : selectionOrPosition?.startLineNumber;
          const column = selectionOrPosition && 'column' in selectionOrPosition
            ? selectionOrPosition.column
            : selectionOrPosition?.startColumn;

          if (!line) {
            await useEditorStore.getState().openFile(workspaceId, targetPath);
            return true;
          }

          if (sourcePath === targetPath) {
            source.setPosition({ lineNumber: line, column: column || 1 });
            source.revealLineInCenter(line);
            return true;
          }

          await jumpToPosition(workspaceId, targetPath, line, column);
          return true;
        },
      }),
      editor.addAction({
        id: 'agentSpaces.showDefinition',
        label: 'Show Definition',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.11,
        run: (currentEditor) => currentEditor.trigger('contextmenu', 'editor.action.peekDefinition', null),
      }),
      editor.addAction({
        id: 'agentSpaces.showReferences',
        label: 'Show References',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.46,
        run: (currentEditor) => currentEditor.trigger('contextmenu', 'editor.action.referenceSearch.trigger', null),
      }),
    );
  }, [jumpToPosition, workspaceId, workspaceRoot]);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, _monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = _monaco;
    if (workspaceRoot) {
      startTypeScriptLanguageClient(workspaceId, workspaceRoot);
    }
    syncReadOnly(editor, isReadOnly);
    registerNavigationActions(editor, _monaco);
    setEditorReadyTick((tick) => tick + 1);

    editor.addCommand(
      2048 | 49, // KeyMod.CtrlCmd | KeyCode.KeyS
      () => handleSaveRef.current()
    );
  }, [isReadOnly, registerNavigationActions, syncReadOnly, workspaceId, workspaceRoot]);

  useEffect(() => {
    if (!editorRef.current || !workspaceRoot) return;
    startTypeScriptLanguageClient(workspaceId, workspaceRoot);
  }, [workspaceId, workspaceRoot]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    registerNavigationActions(editorRef.current, monacoRef.current);
  }, [registerNavigationActions]);

  useEffect(() => {
    return () => stopTypeScriptLanguageClient(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      for (const disposable of navigationDisposablesRef.current) {
        disposable.dispose();
      }
      navigationDisposablesRef.current = [];
    };
  }, []);

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

    const blurReadOnlyInput = (event: FocusEvent) => {
      const editor = editorRef.current;
      const target = event.target as HTMLElement | null;
      if (!editor || !target) return;
      if (!editor.getDomNode()?.contains(target)) return;
      if (target.tagName === 'TEXTAREA') {
        target.blur();
      }
    };

    container.addEventListener('focusin', blurReadOnlyInput, { capture: true });

    return () => {
      container.removeEventListener('focusin', blurReadOnlyInput, { capture: true });
    };
  }, [isReadOnly]);

  // Register model when active file changes
  useEffect(() => {
    if (!activeFile || !activeFilePath) return;

    getOrCreateModel(workspaceId, activeFilePath, activeContent, workspaceRoot);
  }, [activeFilePath, activeContent, workspaceId, workspaceRoot]);

  // Handle pending jump from search results
  useEffect(() => {
    if (!pendingJump || !activeFilePath || pendingJump.path !== activeFilePath || !editorRef.current) return;

    const { line, column, path } = pendingJump;
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

    editor.setPosition({ lineNumber, column: columnNumber });
    editor.revealLineInCenter(lineNumber);
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
      <div ref={editorContainerRef} className="flex-1 min-h-0">
        {isCommitDiff && commitDiffData ? (
          <CommitDiffViewer diffs={commitDiffData.diffs} message={commitDiffData.message} />
        ) : activeFile ? (
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
    // Web
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    jsonc: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    vue: "html",
    svg: "xml",
    xml: "xml",
    // Data / Config
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    ini: "ini",
    env: "ini",
    // Scripting
    py: "python",
    pyw: "python",
    rb: "ruby",
    pl: "perl",
    pm: "perl",
    php: "php",
    lua: "lua",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",
    psm1: "powershell",
    bat: "bat",
    cmd: "bat",
    // Systems
    rs: "rust",
    go: "go",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    hh: "cpp",
    hxx: "cpp",
    cs: "csharp",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    swift: "swift",
    dart: "dart",
    scala: "scala",
    // Functional
    hs: "haskell",
    lhs: "haskell",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    clj: "clojure",
    cljs: "clojure",
    // JVM
    groovy: "groovy",
    gradle: "groovy",
    // Markup / Docs
    md: "markdown",
    mdx: "markdown",
    tex: "latex",
    // Database
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    // Other
    dockerfile: "dockerfile",
    r: "r",
    d: "d",
    zig: "zig",
  };
  // Dockerfile / Makefile by filename
  const name = path.split("/").pop()?.toLowerCase() || "";
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  if (name === "makefile" || name === "gnumakefile") return "makefile";
  if (name === "cmakelists.txt" || name.endsWith(".cmake")) return "cmake";
  if (name === ".gitignore" || name === ".dockerignore" || name === ".eslintignore") return "plaintext";
  return map[ext || ""] || "plaintext";
}
