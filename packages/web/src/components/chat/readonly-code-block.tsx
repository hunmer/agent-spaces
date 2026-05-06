"use client"

import dynamic from "next/dynamic"
import "@/lib/monaco-loader"
import { useTheme } from "@/components/theme-provider"

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
        Loading code...
      </div>
    ),
  },
)

interface ReadonlyCodeBlockProps {
  value: string
  language?: string
  title?: string
  height?: number
}

export function ReadonlyCodeBlock({
  value,
  language = "plaintext",
  title,
  height = 220,
}: ReadonlyCodeBlockProps) {
  const { resolvedTheme } = useTheme()
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      {title ? (
        <div className="border-b bg-muted/30 px-2 py-1 font-mono text-muted-foreground text-xs">
          {title}
        </div>
      ) : null}
      <div style={{ height }}>
        <MonacoEditor
          height="100%"
          language={language}
          value={value}
          options={{
            readOnly: true,
            domReadOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: "on",
            renderLineHighlight: "none",
            wordWrap: "on",
            folding: false,
            overviewRulerLanes: 0,
          }}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
        />
      </div>
    </div>
  )
}
