"use client"

import { useTheme } from "@/components/layout/theme-provider"
import { JsonViewer } from "@/components/viewers/json-viewer"
import { MonacoCodeEditor as MonacoEditor } from "@/components/editor/monaco-code-editor"

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

  if (language === "json") {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      // parse failed, fall through to Monaco
    }
    if (parsed !== undefined && typeof parsed === "object" && parsed !== null) {
      return (
        <JsonViewer
          data={parsed as Parameters<typeof JsonViewer>[0]["data"]}
          title={title}
          rootName={title ?? "root"}
          defaultExpanded={1}
          colorTheme={resolvedTheme === "dark" ? "github-dark" : "github-light"}
          className="min-w-0 max-w-full"
        />
      )
    }
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border bg-background">
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
