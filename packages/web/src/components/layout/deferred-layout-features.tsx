"use client";

import dynamic from "next/dynamic";

// Global utilities are loaded after the first screen to keep the initial route small.
const ConsolePanel = dynamic(
  () => import("@/components/common/console-panel").then((m) => m.ConsolePanel),
  { ssr: false },
);
const CommandPalette = dynamic(
  () => import("@/components/layout/command-palette").then((m) => m.CommandPalette),
  { ssr: false },
);
const ProcmLoggerInit = dynamic(
  () => import("@/components/layout/procm-logger-init").then((m) => m.ProcmLoggerInit),
  { ssr: false },
);
const DevInspector = dynamic(
  () => import("@/components/layout/dev-inspector").then((m) => m.DevInspector),
  { ssr: false },
);

export function DeferredLayoutFeatures() {
  return <><ProcmLoggerInit /><DevInspector /><CommandPalette /><ConsolePanel /></>;
}
