"use client";

import dynamic from "next/dynamic";
import { useEditorStore } from "@/stores/editor";
import { EditorTabs } from "./editor-tabs";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading editor...</div> }
);

interface CodeEditorProps {
  workspaceId: string;
}

export function CodeEditor({ workspaceId }: CodeEditorProps) {
  const { openFiles, activeFilePath, updateContent, saveFile } = useEditorStore();

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
            theme="vs-dark"
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
