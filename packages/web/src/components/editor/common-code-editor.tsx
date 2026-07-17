"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import "@/lib/monaco-builtin-actions";
import "@/components/editor/code-editor-clipboard";
import { useIsMobile } from "@/hooks/use-mobile";
import { Code, Eye, FileText, AlignLeft, Binary } from "lucide-react";
import { useTheme } from "@/components/layout/theme-provider";
import { useTranslations } from "next-intl";
import { CommitDiffViewer } from "@/components/git/commit-diff-viewer";
import type { MediaType, OpenFile } from "@/stores/editor";
import { EditorMenuBar } from "./code-editor-menu-bar";
import { getLanguage } from "./code-editor-utils";
import { collapseEditorSelection } from "./code-editor-mobile";
import { useMobileReadonlyOverlay } from "./useMobileReadonlyOverlay";
import { MobileReadonlyOverlay } from "./code-editor-mobile-overlay";
import { MonacoCodeEditor as MonacoEditor } from "@/components/editor/monaco-code-editor";
import { Markdown } from "@/components/ui/markdown";
import { MermaidPreview } from "@/components/ui/mermaid-preview";
import type { GitDiffResult } from "@agent-spaces/shared";
import type * as Monaco from "monaco-editor";

function getDefaultReadOnly() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}

type CommitDiffData = {
  diffs: GitDiffResult[];
  message: string;
} | null;

export interface PendingEditorJump {
  path: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

interface CommonCodeEditorProps {
  activeFile: OpenFile | undefined;
  activeFilePath: string | null;
  activeContent: string;
  modelPath?: string;
  mediaType: MediaType | null;
  mediaUrl: string | null;
  isCommitDiff: boolean;
  commitDiffData: CommitDiffData;
  pendingJump: PendingEditorJump | null;
  workspaceIdForMarkdown?: string;
  tabs?: React.ReactNode;
  onChange: (filePath: string, value: string) => void;
  onSave: () => void;
  onRefreshActiveFile: () => void;
  onClearPendingJump: () => void;
  onGetExpectedModelPath: (path: string) => string;
  onGetModel: (path: string) => Monaco.editor.ITextModel | null;
  onEnsureModel: (path: string, content: string) => void;
  onRegisterNavigation: (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
    disposables: Monaco.IDisposable[],
  ) => void;
  onRunBuiltinAction?: (actionId: string, editor: Monaco.editor.IStandaloneCodeEditor) => void;
  onApplyRegisteredActions?: (
    editor: Monaco.editor.IStandaloneCodeEditor,
  ) => Monaco.IDisposable[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detectEncoding(content: string): string {
  if (/^[\x00-\x7F]*$/.test(content)) return "ASCII";
  return "UTF-8";
}

function EditorStatusBar({
  file,
  content,
  t,
}: {
  file: OpenFile;
  content: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const lines = content ? content.split("\n").length : 0;
  const sizeBytes = new Blob([content]).size;
  const encoding = detectEncoding(content);

  return (
    <div className="flex items-center px-3 py-1 text-[11px] text-muted-foreground border-t bg-muted/30 select-none shrink-0 overflow-hidden">
      <span className="truncate flex items-center gap-1" title={file.path}>
        <FileText size={11} className="shrink-0" />
        {file.path}
      </span>
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <span className="flex items-center gap-0.5">
          <Binary size={11} />
          {formatFileSize(sizeBytes)}
        </span>
        <span className="flex items-center gap-0.5">
          <AlignLeft size={11} />
          {lines} {t("lines")}
        </span>
        <span>{encoding}</span>
      </div>
    </div>
  );
}

export function CommonCodeEditor({
  activeFile,
  activeFilePath,
  activeContent,
  modelPath,
  mediaType,
  mediaUrl,
  isCommitDiff,
  commitDiffData,
  pendingJump,
  workspaceIdForMarkdown,
  tabs,
  onChange,
  onSave,
  onRefreshActiveFile,
  onClearPendingJump,
  onGetExpectedModelPath,
  onGetModel,
  onEnsureModel,
  onRegisterNavigation,
  onRunBuiltinAction,
  onApplyRegisteredActions,
}: CommonCodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const t = useTranslations("editor");
  const isMobile = useIsMobile();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const navigationDisposablesRef = useRef<Monaco.IDisposable[]>([]);
  const actionRegistryDisposablesRef = useRef<Monaco.IDisposable[]>([]);
  const wheelZoomCleanupRef = useRef<(() => void) | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(getDefaultReadOnly);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordWrap, setWordWrap] = useState(() => localStorage.getItem("editor-word-wrap") === "true");
  const [minimap, setMinimap] = useState(() => localStorage.getItem("editor-minimap") === "true");
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem("editor-font-size");
    return saved ? parseInt(saved, 10) : 13;
  });
  const [monacoTheme, setMonacoTheme] = useState<string | null>(null);
  const [editorReadyTick, setEditorReadyTick] = useState(0);
  const [jumpRetryTick, setJumpRetryTick] = useState(0);
  const [showPreview, setShowPreview] = useState(true);

  const isPreviewable = mediaType === "image" || mediaType === "video" || mediaType === "audio" || mediaType === "svg" || mediaType === "markdown" || mediaType === "mermaid";
  const isCodePreviewToggle = mediaType === "svg" || mediaType === "markdown" || mediaType === "mermaid";

  useEffect(() => { setShowPreview(true); }, [activeFilePath]);

  const mobile = useMobileReadonlyOverlay({
    editorRef,
    monacoRef,
    activeContent,
    onRunBuiltinAction,
    isMobile,
    isReadOnly,
    isCommitDiff,
    hasActiveFile: Boolean(activeFile),
    editorReadyTick,
    wordWrap,
  });

  const handleSaveRef = useRef(onSave);
  useEffect(() => { handleSaveRef.current = onSave; }, [onSave]);

  const syncReadOnly = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, readOnly: boolean) => {
    editor.updateOptions({ readOnly });
  }, []);

  const applyMonacoTheme = useCallback(async (themeName: string | null) => {
    if (themeName === null) {
      setMonacoTheme(null);
      localStorage.removeItem("editor-monaco-theme");
      return;
    }
    try {
      const res = await fetch(`/monaco-themes/${encodeURIComponent(themeName)}.json`);
      const data = await res.json();
      const monaco = monacoRef.current;
      if (monaco) {
        monaco.editor.defineTheme(themeName, data);
        monaco.editor.setTheme(themeName);
      }
      setMonacoTheme(themeName);
      localStorage.setItem("editor-monaco-theme", themeName);
    } catch {}
  }, []);

  const registerNavigation = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    onRegisterNavigation(editor, monaco, navigationDisposablesRef.current);
  }, [onRegisterNavigation]);

  const attachWheelZoom = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    wheelZoomCleanupRef.current?.();

    const node = editor.getDomNode();
    if (!node) return;

    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      setFontSize((prev) => {
        const next = prev + (e.deltaY < 0 ? 1 : -1);
        const clamped = Math.min(Math.max(next, 8), 40);
        localStorage.setItem("editor-font-size", String(clamped));
        return clamped;
      });
    };

    node.addEventListener("wheel", handler, { passive: false, capture: true });
    wheelZoomCleanupRef.current = () => {
      node.removeEventListener("wheel", handler, true);
    };
  }, []);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    syncReadOnly(editor, isReadOnly);
    editor.updateOptions({ fontSize, quickSuggestions: false, renderValidationDecorations: "off" });
    registerNavigation(editor, monaco);
    attachWheelZoom(editor);

    for (const d of actionRegistryDisposablesRef.current) d.dispose();
    actionRegistryDisposablesRef.current = onApplyRegisteredActions
      ? onApplyRegisteredActions(editor)
      : [];

    setEditorReadyTick((tick) => tick + 1);

    editor.addAction({
      id: "agentSpaces.saveFile",
      label: "Save File",
      keybindings: [2048 | 49],
      run: () => handleSaveRef.current(),
    });

    const savedTheme = localStorage.getItem("editor-monaco-theme");
    if (savedTheme) {
      fetch(`/monaco-themes/${encodeURIComponent(savedTheme)}.json`)
        .then((r) => r.json())
        .then((data) => {
          monaco.editor.defineTheme(savedTheme, data);
          monaco.editor.setTheme(savedTheme);
          setMonacoTheme(savedTheme);
        })
        .catch(() => {});
    }
  }, [attachWheelZoom, fontSize, isReadOnly, onApplyRegisteredActions, registerNavigation, syncReadOnly]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    registerNavigation(editorRef.current, monacoRef.current);
  }, [registerNavigation]);

  useEffect(() => {
    return () => {
      wheelZoomCleanupRef.current?.();
      wheelZoomCleanupRef.current = null;
      for (const disposable of navigationDisposablesRef.current) {
        disposable.dispose();
      }
      navigationDisposablesRef.current = [];
      for (const d of actionRegistryDisposablesRef.current) d.dispose();
      actionRegistryDisposablesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!activeFilePath || !activeFile || activeFile.modified || isCommitDiff) return;
    const timer = setInterval(onRefreshActiveFile, 3000);
    return () => clearInterval(timer);
  }, [activeFile, activeFilePath, activeFile?.modified, isCommitDiff, onRefreshActiveFile]);

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

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ wordWrap: wordWrap ? "on" : "off" });
  }, [wordWrap]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ minimap: { enabled: minimap } });
  }, [minimap]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ fontSize });
  }, [fontSize]);

  useEffect(() => {
    if (!activeFile || !activeFilePath) return;
    onEnsureModel(activeFilePath, activeContent);
  }, [activeFile, activeFilePath, activeContent, onEnsureModel]);

  useEffect(() => {
    if (!pendingJump || !activeFilePath || pendingJump.path !== activeFilePath) return;

    if (isCodePreviewToggle && showPreview) {
      setShowPreview(false);
      return;
    }

    if (!editorRef.current) return;

    const { line, column, endLine, endColumn, path } = pendingJump;
    const editor = editorRef.current;
    let model = editor.getModel();
    const expectedModelPath = onGetExpectedModelPath(path);
    if (!model || model.uri.path !== expectedModelPath) {
      const targetModel = onGetModel(path);
      if (targetModel) {
        editor.setModel(targetModel);
        model = targetModel;
      }
    }

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
        className: "symbolHighlight",
        stickiness: 1,
      },
    }]);
    window.setTimeout(() => highlights.clear(), 700);
    if (!isReadOnly) {
      editor.focus();
    }
    onClearPendingJump();
  }, [pendingJump, activeFilePath, editorReadyTick, jumpRetryTick, onClearPendingJump, isReadOnly, isCodePreviewToggle, showPreview, onGetExpectedModelPath, onGetModel]);

  const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
    fontSize,
    minimap: { enabled: minimap },
    scrollBeyondLastLine: false,
    glyphMargin: true,
    lineNumbersMinChars: 3,
    padding: { top: 8 },
    renderLineHighlight: "gutter",
    readOnly: isReadOnly,
    wordWrap: wordWrap ? "on" : "off",
  };

  const renderMonacoEditor = (withGotoLocation: boolean) => (
    <MonacoEditor
      height="100%"
      language={activeFile ? getLanguage(activeFile.path) : undefined}
      value={activeContent}
      path={modelPath}
      onChange={(value, event) => {
        if (!activeFile || event.isFlush) return;
        onChange(activeFile.path, value || "");
      }}
      onMount={handleMount}
      options={{
        ...editorOptions,
        ...(withGotoLocation
          ? {
              gotoLocation: {
                multipleDefinitions: "goto",
                multipleTypeDefinitions: "goto",
                multipleDeclarations: "goto",
                multipleImplementations: "goto",
                multipleReferences: "goto",
              },
            }
          : {}),
      }}
      theme={monacoTheme || (resolvedTheme === "dark" ? "vs-dark" : "vs")}
    />
  );

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`}>
      {tabs}
      <EditorMenuBar
        editorRef={editorRef}
        activeFilePath={activeFilePath}
        isReadOnly={isReadOnly}
        onSave={onSave}
        onToggleReadOnly={() => setIsReadOnly((r) => !r)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((f) => !f)}
        wordWrap={wordWrap}
        onToggleWordWrap={() => {
          const v = !wordWrap;
          setWordWrap(v);
          localStorage.setItem("editor-word-wrap", String(v));
        }}
        minimap={minimap}
        onToggleMinimap={() => {
          const v = !minimap;
          setMinimap(v);
          localStorage.setItem("editor-minimap", String(v));
        }}
        fontSize={fontSize}
        onZoomIn={() => setFontSize((s) => {
          const n = Math.min(s + 1, 40);
          localStorage.setItem("editor-font-size", String(n));
          return n;
        })}
        onZoomOut={() => setFontSize((s) => {
          const n = Math.max(s - 1, 8);
          localStorage.setItem("editor-font-size", String(n));
          return n;
        })}
        onZoomReset={() => {
          setFontSize(13);
          localStorage.setItem("editor-font-size", "13");
        }}
        monacoTheme={monacoTheme}
        onThemeChange={applyMonacoTheme}
      />
      <div className="relative flex-1 min-h-0 bg-background" {...mobile.containerProps}>
        {isCommitDiff && commitDiffData ? (
          <CommitDiffViewer diffs={commitDiffData.diffs} message={commitDiffData.message} />
        ) : isPreviewable && showPreview && (mediaUrl || mediaType === "markdown" || mediaType === "mermaid") ? (
          <div className="relative flex justify-center h-full bg-muted/20 overflow-auto">
            {isCodePreviewToggle && (
              <button
                onClick={() => setShowPreview(false)}
                className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/90 border text-xs text-muted-foreground hover:text-foreground hover:bg-background shadow-sm transition-colors cursor-pointer"
                title={t("switchToCode")}
              >
                <Code size={14} />
                {t("code")}
              </button>
            )}
            {mediaType === "image" && (
              <img src={mediaUrl!} alt={activeFile?.name} className="max-w-full max-h-full object-contain" />
            )}
            {mediaType === "video" && (
              <video src={mediaUrl!} controls className="max-w-full max-h-full" />
            )}
            {mediaType === "audio" && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-muted-foreground text-sm">{activeFile?.name}</div>
                <audio src={mediaUrl!} controls />
              </div>
            )}
            {mediaType === "svg" && (
              <img src={mediaUrl!} alt={activeFile?.name} className="max-w-full max-h-full object-contain" />
            )}
            {mediaType === "markdown" && activeContent && (
              <div className="prose prose-sm dark:prose-invert max-w-none w-full max-w-4xl mx-auto">
                <Markdown content={activeContent} workspaceId={workspaceIdForMarkdown} />
              </div>
            )}
            {mediaType === "mermaid" && activeContent && (
              <div className="w-full mx-auto">
                <MermaidPreview chart={activeContent} theme={resolvedTheme} />
              </div>
            )}
          </div>
        ) : activeFile && isCodePreviewToggle && !showPreview ? (
          <div className="relative flex flex-col h-full">
            <button
              onClick={() => setShowPreview(true)}
              className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/90 border text-xs text-muted-foreground hover:text-foreground hover:bg-background shadow-sm transition-colors cursor-pointer"
              title={t("switchToPreview")}
            >
              <Eye size={14} />
              {t("preview")}
            </button>
            {renderMonacoEditor(false)}
          </div>
        ) : activeFile ? (
          <>
            {renderMonacoEditor(true)}
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
            {t("openFileToEdit")}
          </div>
        )}
      </div>
      {activeFile && !isCommitDiff && (
        <EditorStatusBar file={activeFile} content={activeContent} t={t} />
      )}
    </div>
  );
}
