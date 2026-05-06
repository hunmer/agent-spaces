"use client";

import dynamic from "next/dynamic";
import "@/lib/monaco-loader";
import { useEditorStore } from "@/stores/editor";
import { EditorTabs } from "./editor-tabs";
import { useTheme } from "@/components/theme-provider";

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

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading editor...</div> }
);

interface CodeEditorProps {
  workspaceId: string;
}

export function CodeEditor({ workspaceId }: CodeEditorProps) {
  const { openFiles, activeFilePath, updateContent, saveFile } = useEditorStore();
  const { resolvedTheme } = useTheme();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  const handleSave = () => {
    if (activeFilePath) {
      saveFile(workspaceId, activeFilePath);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <EditorTabs workspaceId={workspaceId} />
      <div className="flex-1 min-h-0">
        {activeFile ? (
          <MonacoEditor
            height="100%"
            language={getLanguage(activeFile.path)}
            value={activeFile.content}
            onChange={(value) => updateContent(activeFile.path, value || "")}
            onMount={(editor) => {
              editor.addCommand(
                // Ctrl+S / Cmd+S
                2048 | 49, // KeyMod.CtrlCmd | KeyCode.KeyS
                () => handleSave()
              );
            }}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 8 },
              renderLineHighlight: "gutter",
            }}
            theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Open a file to start editing
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
