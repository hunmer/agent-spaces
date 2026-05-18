import type * as Monaco from 'monaco-editor';

export interface MonacoActionContext {
  workspaceId: string;
  workspaceRoot?: string;
}

export interface MonacoActionDescriptor {
  id: string;
  label: string;
  keybindings?: number[];
  contextMenuGroupId?: string;
  contextMenuOrder?: number;
  run: (editor: Monaco.editor.IStandaloneCodeEditor, context: MonacoActionContext) => void;
}

type ActionRegistry = Map<string, MonacoActionDescriptor>;
const registry: ActionRegistry = new Map();

export function registerMonacoAction(action: MonacoActionDescriptor) {
  registry.set(action.id, action);
}

export function unregisterMonacoAction(id: string) {
  registry.delete(id);
}

export function getRegisteredActions(): MonacoActionDescriptor[] {
  return Array.from(registry.values());
}

function toRelativePath(modelPath: string, ctx: MonacoActionContext): string | null {
  if (ctx.workspaceRoot) {
    const root = ctx.workspaceRoot.replace(/\/+$/, '');
    if (modelPath.startsWith(`${root}/`)) {
      return decodeURIComponent(modelPath.slice(root.length + 1));
    }
  }
  for (const prefix of [`/workspace/${ctx.workspaceId}/`, `/${ctx.workspaceId}/`]) {
    if (modelPath.startsWith(prefix)) {
      return decodeURIComponent(modelPath.slice(prefix.length));
    }
  }
  return null;
}

export function applyRegisteredActions(
  editor: Monaco.editor.IStandaloneCodeEditor,
  context: MonacoActionContext,
) {
  const disposables: Monaco.IDisposable[] = [];
  for (const action of registry.values()) {
    disposables.push(editor.addAction({
      ...action,
      run: (ed: Monaco.editor.IStandaloneCodeEditor) => action.run(ed, context),
    }));
  }
  return disposables;
}

export { toRelativePath };
