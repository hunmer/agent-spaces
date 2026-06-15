"use client";

import dynamic from "next/dynamic";
import type { EditorProps } from "@monaco-editor/react";
import { useTheme } from "@/components/layout/theme-provider";
import "@/lib/monaco-loader";

function MonacoCodeEditorLoading() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      Loading editor...
    </div>
  );
}

const MonacoEditor = dynamic<EditorProps>(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false, loading: () => <MonacoCodeEditorLoading /> },
);

// 包装一层：未显式传 theme 时按当前亮/暗主题取 vs / vs-dark，
// 已传 theme 的调用方（如工作区主编辑器）行为不变。
export function MonacoCodeEditor({ theme, ...props }: EditorProps) {
  const { resolvedTheme } = useTheme();
  return (
    <MonacoEditor
      theme={theme ?? (resolvedTheme === "dark" ? "vs-dark" : "vs")}
      {...props}
    />
  );
}

export type { EditorProps as MonacoCodeEditorProps };
