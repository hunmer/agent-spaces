"use client";

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriEnvironment } from "@/lib/native-notification";

export function TauriFullscreen() {
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    getCurrentWindow().setFullscreen(true).catch(() => {
      // Ignore unsupported platforms or missing window capability.
    });
  }, []);

  return null;
}
