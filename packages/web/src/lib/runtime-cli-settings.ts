"use client";

import { useEffect, useState } from "react";

export type RuntimeCliId = "claude-code" | "codex" | "gemini-cli" | "claude-code-sdk" | "codex-sdk" | "open-agent-sdk";
export type RuntimeCategory = "cli" | "sdk";
export type SupportedRuntimeKind = "claude-code" | "codex" | "open-agent-sdk";

export interface RuntimeCliDiscoveryItem {
  id: RuntimeCliId;
  category: RuntimeCategory;
  label: string;
  command: string;
  found: boolean;
  path: string | null;
  version: string | null;
  enabled: boolean;
  supportedRuntime: boolean;
  runtimeKind: SupportedRuntimeKind | null;
}

interface RuntimeCliSettingsState {
  items: RuntimeCliDiscoveryItem[];
  updatedAt: string | null;
}

interface RuntimeCliDiscoveryResponseItem {
  id: RuntimeCliId;
  category: RuntimeCategory;
  label: string;
  command: string;
  found: boolean;
  path: string | null;
  version: string | null;
  supportedRuntime: boolean;
  runtimeKind: SupportedRuntimeKind | null;
}

const STORAGE_KEY = "agent-spaces:runtime-cli-settings";
const CHANGE_EVENT = "agent-spaces:runtime-cli-settings-change";

const DEFAULT_STATE: RuntimeCliSettingsState = {
  items: [],
  updatedAt: null,
};

export function useRuntimeCliSettings() {
  const [state, setState] = useState<RuntimeCliSettingsState>(() => readRuntimeCliSettings());

  useEffect(() => {
    const handleChange = () => setState(readRuntimeCliSettings());
    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return state;
}

export function readRuntimeCliSettings(): RuntimeCliSettingsState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<RuntimeCliSettingsState>;
    return {
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeStoredItem).filter(Boolean) as RuntimeCliDiscoveryItem[]
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveRuntimeCliDiscovery(items: RuntimeCliDiscoveryResponseItem[]) {
  const previous = readRuntimeCliSettings();
  const previousById = new Map(previous.items.map((item) => [item.id, item]));
  const next: RuntimeCliSettingsState = {
    items: items.map((item) => ({
      ...item,
      enabled: item.category === "cli" && item.found ? (previousById.get(item.id)?.enabled ?? true) : false,
    })),
    updatedAt: new Date().toISOString(),
  };
  persistRuntimeCliSettings(next);
  return next;
}

export function setRuntimeCliEnabled(id: RuntimeCliId, enabled: boolean) {
  const current = readRuntimeCliSettings();
  const next: RuntimeCliSettingsState = {
    ...current,
    items: current.items.map((item) => (item.id === id && item.found ? { ...item, enabled } : item)),
  };
  persistRuntimeCliSettings(next);
  return next;
}

export function getEnabledDiscoveredRuntimeKinds(items: RuntimeCliDiscoveryItem[]): SupportedRuntimeKind[] {
  return items
    .filter((item): item is RuntimeCliDiscoveryItem & { runtimeKind: SupportedRuntimeKind } => (
      item.found && item.enabled && item.supportedRuntime && Boolean(item.runtimeKind)
    ))
    .map((item) => item.runtimeKind);
}

function persistRuntimeCliSettings(state: RuntimeCliSettingsState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function normalizeStoredItem(item: unknown): RuntimeCliDiscoveryItem | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Partial<RuntimeCliDiscoveryItem>;
  if (
    value.id !== "claude-code"
    && value.id !== "codex"
    && value.id !== "gemini-cli"
    && value.id !== "claude-code-sdk"
    && value.id !== "codex-sdk"
    && value.id !== "open-agent-sdk"
  ) return null;
  return {
    id: value.id,
    category: value.category === "sdk" ? "sdk" : "cli",
    label: typeof value.label === "string" ? value.label : value.id,
    command: typeof value.command === "string" ? value.command : value.id,
    found: value.found === true,
    path: typeof value.path === "string" ? value.path : null,
    version: typeof value.version === "string" ? value.version : null,
    enabled: value.enabled === true,
    supportedRuntime: value.supportedRuntime === true,
    runtimeKind: value.runtimeKind === "claude-code" || value.runtimeKind === "codex" || value.runtimeKind === "open-agent-sdk" ? value.runtimeKind : null,
  };
}
