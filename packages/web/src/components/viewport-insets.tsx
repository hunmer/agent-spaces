"use client";

import { useEffect } from "react";

function updateViewportInsets() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const keyboardHeight = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;

  root.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
  root.style.setProperty("--keyboard-inset-height", `${keyboardHeight}px`);
}

export function ViewportInsets() {
  useEffect(() => {
    updateViewportInsets();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateViewportInsets);
    viewport?.addEventListener("scroll", updateViewportInsets);
    window.addEventListener("resize", updateViewportInsets);
    window.addEventListener("orientationchange", updateViewportInsets);

    return () => {
      viewport?.removeEventListener("resize", updateViewportInsets);
      viewport?.removeEventListener("scroll", updateViewportInsets);
      window.removeEventListener("resize", updateViewportInsets);
      window.removeEventListener("orientationchange", updateViewportInsets);
    };
  }, []);

  return null;
}
