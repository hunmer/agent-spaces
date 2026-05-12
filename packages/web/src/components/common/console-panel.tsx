"use client";

import { useEffect, useRef, useState } from "react";

interface ErrorEntry {
  id: number;
  time: number;
  args: unknown[];
}

export function ConsolePanel() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const originalRef = useRef<typeof console.error | null>(null);

  useEffect(() => {
    setMounted(true);
    const orig = console.error;
    originalRef.current = orig;
    console.error = (...args: unknown[]) => {
      orig.apply(console, args);
      idRef.current += 1;
      setErrors((prev) => [...prev.slice(-199), { id: idRef.current, time: Date.now(), args }]);
    };
    return () => { console.error = orig; };
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [errors]);

  if (!mounted) return null;

  const formatArg = (arg: unknown): string => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === "string") return arg;
    try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div
      data-console-panel
      style={{ position: "fixed", zIndex: 99999 }}
    >
      {open ? (
        <div
          style={{
            position: "fixed", right: 20, bottom: 20,
            width: 420, height: 340,
            background: "#1e1e1e", color: "#d4d4d4",
            borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", fontFamily: "monospace",
            fontSize: 12, overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#2d2d2d", borderBottom: "1px solid #404040" }}>
            <span>Console Errors: {errors.length}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setErrors([])} style={{ background: "#404040", color: "#d4d4d4", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>Clear</button>
              <button onClick={() => setOpen(false)} style={{ background: "#404040", color: "#d4d4d4", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>Hide</button>
            </div>
          </div>
          <div ref={listRef} style={{ flex: 1, overflow: "auto", padding: 8 }}>
            {errors.length === 0 && <div style={{ color: "#666", textAlign: "center", padding: 20 }}>No console errors captured</div>}
            {errors.map((e) => (
              <div key={e.id} style={{ padding: 6, marginBottom: 4, background: "#3c1f1f", border: "1px solid #5c2d2d", borderRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                <span style={{ color: "#f87171" }}>[{formatTime(e.time)}]</span> {e.args.map(formatArg).join(" ")}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          onClick={() => setOpen(true)}
          style={{
            position: "fixed", right: 20, bottom: 20,
            width: 44, height: 44, borderRadius: "50%",
            background: errors.length > 0 ? "#ef4444" : "#3b82f6",
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontWeight: 700, fontSize: 16,
            boxShadow: errors.length > 0 ? "0 4px 12px rgba(239,68,68,0.5)" : "0 4px 12px rgba(59,130,246,0.4)",
          }}
        >
          C
        </div>
      )}
    </div>
  );
}
