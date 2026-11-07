import type { IJsonModel } from "flexlayout-react";

export interface LayoutTemplate {
  id: string;
  name: string;
  json: IJsonModel;
  createdAt: number;
}

/** localStorage key storing the saved layout templates list (workspace shell). */
export const LAYOUT_TEMPLATES_KEY = "agent-spaces:layout-templates";
/** localStorage key storing the active workspace-shell flexlayout JSON. */
export const LAYOUT_STORAGE_KEY = "flexlayout-global";
/** Event dispatched after a workspace-shell layout template is applied. */
export const LAYOUT_APPLY_EVENT = "apply-layout";
/** Event dispatched to reset the workspace-shell layout to default. */
export const LAYOUT_RESET_EVENT = "reset-layout";

/**
 * Load saved layout templates from localStorage.
 * @param storageKey templates list key (defaults to the workspace-shell key)
 */
export function loadLayoutTemplates(storageKey: string = LAYOUT_TEMPLATES_KEY): LayoutTemplate[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLayoutTemplates(
  templates: LayoutTemplate[],
  storageKey: string = LAYOUT_TEMPLATES_KEY,
) {
  localStorage.setItem(storageKey, JSON.stringify(templates));
}

export function addLayoutTemplate(
  name: string,
  json: IJsonModel,
  storageKey: string = LAYOUT_TEMPLATES_KEY,
): LayoutTemplate {
  const templates = loadLayoutTemplates(storageKey);
  const t: LayoutTemplate = { id: crypto.randomUUID(), name, json, createdAt: Date.now() };
  templates.push(t);
  saveLayoutTemplates(templates, storageKey);
  return t;
}

export function renameLayoutTemplate(
  id: string,
  name: string,
  storageKey: string = LAYOUT_TEMPLATES_KEY,
) {
  const templates = loadLayoutTemplates(storageKey);
  const t = templates.find((t) => t.id === id);
  if (t) t.name = name;
  saveLayoutTemplates(templates, storageKey);
}

export function deleteLayoutTemplate(id: string, storageKey: string = LAYOUT_TEMPLATES_KEY) {
  const templates = loadLayoutTemplates(storageKey).filter((t) => t.id !== id);
  saveLayoutTemplates(templates, storageKey);
}

/**
 * Persist a layout JSON to localStorage and notify listeners via a custom event.
 * Used by the workspace-shell layout manager (event-driven model).
 */
export function applyLayoutToStorage(
  json: IJsonModel,
  layoutStorageKey: string = LAYOUT_STORAGE_KEY,
  applyEvent: string = LAYOUT_APPLY_EVENT,
) {
  localStorage.setItem(layoutStorageKey, JSON.stringify(json));
  window.dispatchEvent(new CustomEvent(applyEvent));
}
