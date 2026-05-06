"use client";

import "@/lib/monaco-loader";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import { useTheme } from "@/components/theme-provider";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  path: string;
  language?: string;
}

function detectLanguage(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown',
    css: 'css', html: 'html',
    py: 'python', rs: 'rust',
    go: 'go', yaml: 'yaml', yml: 'yaml',
  };
  return ext ? map[ext] : undefined;
}

export function DiffViewer({ oldContent, newContent, path }: DiffViewerProps) {
  const language = detectLanguage(path);
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const { resolvedTheme } = useTheme();

  const handleMount: DiffOnMount = (editor) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    return () => {
      const editor = editorRef.current;
      if (editor) {
        editor.setModel(null);
        editorRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="text-xs text-muted-foreground px-2 py-1 border-b bg-muted/30 font-mono truncate">
        {path}
      </div>
      <div className="flex-1">
        <DiffEditor
          original={oldContent}
          modified={newContent}
          language={language}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          onMount={handleMount}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "on",
          }}
        />
      </div>
    </div>
  );
}
