"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";
import { ZoomIn, ZoomOut, Maximize, Palette } from "lucide-react";

type MermaidTheme = "default" | "dark" | "forest" | "neutral" | "base";

const THEMES: { value: MermaidTheme; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "dark", label: "Dark" },
  { value: "forest", label: "Forest" },
  { value: "neutral", label: "Neutral" },
  { value: "base", label: "Base" },
];

let mermaidIdCounter = 0;

async function renderMermaid(chart: string, theme: MermaidTheme): Promise<string> {
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "loose",
  });
  const id = `mermaid-${++mermaidIdCounter}`;
  const { svg } = await mermaid.render(id, chart);
  return svg;
}

interface MermaidPreviewProps {
  chart?: string;
  /** @deprecated Use chart instead */
  code?: string;
  theme?: string;
}

export function MermaidPreview({ chart, code, theme: appTheme = "light" }: MermaidPreviewProps) {
  const chartSource = chart ?? code ?? "";
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mermaidTheme, setMermaidTheme] = useState<MermaidTheme>(() =>
    appTheme === "dark" ? "dark" : "default"
  );
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const renderChart = useCallback(async () => {
    if (!chartSource.trim()) {
      setSvg("");
      setError(null);
      return;
    }
    try {
      const rendered = await renderMermaid(chartSource, mermaidTheme);
      setSvg(rendered);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^Parse error.*?:/, "").trim());
      setSvg("");
    }
  }, [chartSource, mermaidTheme]);

  useEffect(() => { renderChart(); }, [renderChart]);

  // Reset view when chart changes
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [chartSource]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.25)), []);
  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Pan handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [translate]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      setTranslate({
        x: panStart.current.tx + (e.clientX - panStart.current.x),
        y: panStart.current.ty + (e.clientY - panStart.current.y),
      });
    },
    [isPanning]
  );

  const handlePointerUp = useCallback(() => setIsPanning(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(Math.max(s + (e.deltaY < 0 ? 0.1 : -0.1), 0.25), 5));
  }, []);

  if (error) {
    return (
      <div className="text-destructive text-sm p-4 bg-destructive/10 rounded-md">
        <p className="font-medium mb-1">Mermaid syntax error</p>
        <pre className="whitespace-pre-wrap text-xs">{error}</pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Zoom out"
        >
          <ZoomOut size={15} />
        </button>
        <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Zoom in"
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={resetView}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Reset view"
        >
          <Maximize size={15} />
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Theme selector */}
        <div className="relative">
          <button
            onClick={() => setShowThemeMenu((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground text-xs transition-colors cursor-pointer"
          >
            <Palette size={14} />
            {THEMES.find((t) => t.value === mermaidTheme)?.label}
          </button>
          {showThemeMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)} />
              <div className="absolute left-0 top-full mt-1 bg-popover border rounded-md shadow-md z-50 py-1 min-w-[120px]">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setMermaidTheme(t.value);
                      setShowThemeMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors cursor-pointer ${
                      mermaidTheme === t.value ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Diagram area */}
      {svg ? (
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing bg-muted/10"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          <div
            className="flex justify-center items-center min-h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-none"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Rendering...
        </div>
      )}
    </div>
  );
}
