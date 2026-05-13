"use client";

import { useEffect, useState } from "react";

export function ZoomWrapper({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const saved = localStorage.getItem("pageZoom");
    if (saved) {
      const v = Number(saved);
      if (v >= 50 && v <= 200) setZoom(v);
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "number" && detail >= 50 && detail <= 200) {
        setZoom(detail);
      }
    };
    window.addEventListener("zoom-change", handler);
    return () => window.removeEventListener("zoom-change", handler);
  }, []);

  const scale = zoom / 100;

  return (
    <div
      style={{
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        zoom: scale,
      }}
    >
      {children}
    </div>
  );
}
