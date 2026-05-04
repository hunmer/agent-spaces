"use client";

import "@/lib/monaco-loader";
import { DiffEditor } from "@monaco-editor/react";

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
          theme="vs"
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
