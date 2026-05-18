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
  inferredWorkspaceRoot?: string | null,
): string | null {
  if (!modelUri) return null;

  const rootPath = (workspaceRoot || inferredWorkspaceRoot || '').replace(/\/+$/, '');
  if (rootPath && modelUri.path.startsWith(`${rootPath}/`)) {
    return decodeURIComponent(modelUri.path.slice(rootPath.length + 1));
  }

  return getFilePathFromModelPath(modelUri.path, workspaceId);
}

function inferWorkspaceRootFromModelUri(
  modelUri: Monaco.Uri | undefined,
  filePath: string | null,
): string | null {
  if (!modelUri || modelUri.scheme !== 'file' || !filePath) return null;
  const suffix = `/${filePath}`;
  if (!modelUri.path.endsWith(suffix)) return null;
  return decodeURIComponent(modelUri.path.slice(0, -suffix.length));
}

const RESOLVABLE_EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json'];
const RESOLVABLE_INDEX_FILES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.mjs', 'index.cjs', 'index.json'];

function normalizeRelativePath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

async function fileExists(workspaceId: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/workspaces/${workspaceId}/files/exists?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    return Boolean(data.exists);
  } catch {
    return false;
  }
}

async function resolveExistingModulePath(workspaceId: string, basePath: string): Promise<string | null> {
  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = `${basePath}${ext}`;
    if (await fileExists(workspaceId, candidate)) return candidate;
  }

  for (const filename of RESOLVABLE_INDEX_FILES) {
    const candidate = `${basePath}/${filename}`;
    if (await fileExists(workspaceId, candidate)) return candidate;
  }

  return null;
}

function getImportSpecifierAtLine(model: Monaco.editor.ITextModel, lineNumber: number): string | null {
  const line = model.getLineContent(lineNumber);
  const match = line.match(/\bfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/);
  return match?.[1] || match?.[2] || match?.[3] || match?.[4] || null;
}

async function resolveImportSpecifierPath(
  workspaceId: string,
  sourcePath: string,
  specifier: string,
): Promise<string | null> {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;

  const sourceDir = sourcePath.split('/').slice(0, -1).join('/');
  const srcIndex = sourcePath.split('/').lastIndexOf('src');
  const srcRoot = srcIndex >= 0 ? sourcePath.split('/').slice(0, srcIndex + 1).join('/') : 'src';
  const basePath = specifier.startsWith('@/')
    ? `${srcRoot}/${specifier.slice(2)}`
    : `${sourceDir}/${specifier}`;

  const normalized = normalizeRelativePath(basePath);
  return normalized ? resolveExistingModulePath(workspaceId, normalized) : null;
}

async function readWorkspaceFile(workspaceId: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.content === 'string' ? data.content : null;
  } catch {
    return null;
  }
}

function findExportedSymbolPosition(content: string, symbolName: string): { line: number; column: number; endColumn: number } | null {
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\bexport\\s+default\\s+function\\s+(${escaped})\\b`),
    new RegExp(`\\bexport\\s+function\\s+(${escaped})\\b`),
    new RegExp(`\\bexport\\s+(?:const|let|var|class)\\s+(${escaped})\\b`),
    new RegExp(`\\bfunction\\s+(${escaped})\\b`),
    new RegExp(`\\b(?:const|let|var|class)\\s+(${escaped})\\b`),
    new RegExp(`\\bexport\\s+default\\s+(${escaped})\\b`),
  ];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (!match || match.index == null) continue;
      const symbolIndex = match[1] ? line.indexOf(match[1], match.index) : match.index;
      if (symbolIndex < 0) continue;
      return {
        line: lineIndex + 1,
        column: symbolIndex + 1,
        endColumn: symbolIndex + symbolName.length + 1,
      };
    }
  }

  return null;
}

if (typeof window !== "undefined") {
  const currentClipboard = navigator.clipboard;
  const originalWriteText = currentClipboard?.writeText?.bind(currentClipboard);
  const originalWrite = currentClipboard?.write?.bind(currentClipboard);

  Object.defineProperty(navigator, "clipboard", {
    value: {
      ...currentClipboard,
      writeText: (text: string) =>
        (originalWriteText?.(text) ?? Promise.resolve()).catch(() => undefined),
      write: async (items: ClipboardItem[]) => {
        try {
          if (originalWrite) {
            await originalWrite(items);
            return;
          }
        } catch {
          // Some embedded browsers expose Clipboard.write but disallow it.
        }

        const textItem = items[0]?.getType("text/plain");
        if (!textItem) return;
        const text = await textItem.then((blob) => blob.text());
        await (originalWriteText?.(text) ?? Promise.resolve()).catch(() => undefined);
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
      editor.onContextMenu((event) => {
        const position = event.target.position;
        if (!position) return;
        editor.setPosition(position);
        console.info('[monaco-navigation] context menu position', {
          uri: editor.getModel()?.uri.toString(),
          lineNumber: position.lineNumber,
          column: position.column,
          word: editor.getModel()?.getWordAtPosition(position)?.word,
        });
      }),
      monaco.editor.registerEditorOpener({
        openCodeEditor: async (source, resource, selectionOrPosition) => {
          const inferredRoot = inferWorkspaceRootFromModelUri(source.getModel()?.uri, activeFilePath);
          const targetPath = getFilePathFromModelUri(resource, workspaceId, workspaceRoot, inferredRoot);
          if (!targetPath) {
            console.warn('[monaco-navigation] failed to map target uri', {
              uri: resource.toString(),
              workspaceRoot,
              inferredRoot,
              activeFilePath,
            });
            return false;
          }

          const sourcePath = getFilePathFromModelUri(source.getModel()?.uri, workspaceId, workspaceRoot, inferredRoot);
          const line = selectionOrPosition && 'lineNumber' in selectionOrPosition
            ? selectionOrPosition.lineNumber
            : selectionOrPosition?.startLineNumber;
          const column = selectionOrPosition && 'column' in selectionOrPosition
            ? selectionOrPosition.column
            : selectionOrPosition?.startColumn;

          console.info('[monaco-navigation] open target', {
            uri: resource.toString(),
            targetPath,
            sourcePath,
            line,
            column,
          });

          if (sourcePath === targetPath && line) {
            const model = source.getModel();
            const specifier = model ? getImportSpecifierAtLine(model, line) : null;
            const resolvedPath = specifier
              ? await resolveImportSpecifierPath(workspaceId, sourcePath, specifier)
              : null;

            if (resolvedPath && resolvedPath !== sourcePath) {
              const symbolName = model?.getWordAtPosition(source.getPosition() ?? { lineNumber: line, column: column || 1 })?.word;
              const targetContent = symbolName ? await readWorkspaceFile(workspaceId, resolvedPath) : null;
              const symbolPosition = targetContent && symbolName
                ? findExportedSymbolPosition(targetContent, symbolName)
                : null;
              console.info('[monaco-navigation] resolved import target', {
                specifier,
                sourcePath,
                resolvedPath,
                symbolName,
                symbolPosition,
              });
              window.setTimeout(() => {
                void jumpToPosition(
                  workspaceId,
                  resolvedPath,
                  symbolPosition?.line ?? 1,
                  symbolPosition?.column ?? 1,
                  symbolPosition?.line,
                  symbolPosition?.endColumn,
                ).then(() => {
                  console.info('[monaco-navigation] jumped to resolved import target', {
                    resolvedPath,
                  });
                });
              }, 0);
              return true;
            }
          }

          if (!line) {
            await useEditorStore.getState().openFile(workspaceId, targetPath);
            return true;
          }

          if (sourcePath === targetPath) {
            source.setPosition({ lineNumber: line, column: column || 1 });
            source.revealLineInCenter(line);
            return true;
          }

          window.setTimeout(() => {
            void jumpToPosition(workspaceId, targetPath, line, column);
          }, 0);
          return true;
        },
      }),
      editor.addAction({
        id: 'agentSpaces.showDefinition',
        label: 'Show Definition',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.11,
        run: (currentEditor) => currentEditor.getAction('editor.action.peekDefinition')?.run(),
      }),
      editor.addAction({
        id: 'agentSpaces.showReferences',
        label: 'Show References',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.46,
        run: (currentEditor) => currentEditor.getAction('editor.action.referenceSearch.trigger')?.run(),
      }),
      editor.addAction({
        id: 'agentSpaces.find',
        label: 'Find',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
        run: (currentEditor) => currentEditor.getAction('actions.find')?.run(),
      }),
      editor.addAction({
        id: 'agentSpaces.replace',
        label: 'Replace',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH],
        run: (currentEditor) => currentEditor.getAction('editor.action.startFindReplaceAction')?.run(),
      }),
      editor.addAction({
        id: 'agentSpaces.findInFiles',
        label: 'Find in Files',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
        run: () => {
          useEditorStore.getState().setRevealPath('__search_panel__');
        },
      }),
      editor.addAction({
        id: 'agentSpaces.goToLine',
        label: 'Go to Line...',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG],
        run: (currentEditor) => currentEditor.getAction('editor.action.gotoLine')?.run(),
      }),
      editor.addAction({
        id: 'agentSpaces.formatDocument',
        label: 'Format Document',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: (currentEditor) => currentEditor.getAction('editor.action.formatDocument')?.run(),
      }),
    );
  }, [activeFilePath, jumpToPosition, workspaceId, workspaceRoot]);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, _monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = _monaco;
    if (workspaceRoot) {
      startTypeScriptLanguageClient(workspaceId, workspaceRoot);
    }
    syncReadOnly(editor, isReadOnly);
    registerNavigationActions(editor, _monaco);
    setEditorReadyTick((tick) => tick + 1);

    editor.addAction({
      id: 'agentSpaces.saveFile',
      label: 'Save File',
      keybindings: [2048 | 49], // KeyMod.CtrlCmd | KeyCode.KeyS
      run: () => handleSaveRef.current(),
    });
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
