import { editor as MonacoEditor, Uri, languages } from 'monaco-editor';

const PRELOAD_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const MAX_PRELOAD_FILES = 20;
const MAX_PRELOAD_SIZE = 500 * 1024; // 500KB

const modelCache = new Map<string, MonacoEditor.ITextModel>();
const preloadedDirs = new Set<string>();

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown',
    css: 'css', html: 'html',
    yaml: 'yaml', yml: 'yaml',
    py: 'python', rs: 'rust', go: 'go',
    sql: 'sql', sh: 'shell', bash: 'shell',
  };
  return map[ext] || 'plaintext';
}

function toUri(workspaceId: string, filePath: string): Uri {
  return Uri.parse(`file:///workspace/${workspaceId}/${filePath}`);
}

export function getOrCreateModel(
  workspaceId: string,
  filePath: string,
  content: string,
): MonacoEditor.ITextModel {
  const uri = toUri(workspaceId, filePath);
  let model = MonacoEditor.getModel(uri);

  if (!model) {
    model = MonacoEditor.createModel(content, getLanguageFromPath(filePath), uri);
  } else {
    if (model.getValue() !== content) {
      model.setValue(content);
    }
  }

  modelCache.set(filePath, model);
  return model;
}

export function getModel(workspaceId: string, filePath: string): MonacoEditor.ITextModel | null {
  const uri = toUri(workspaceId, filePath);
  return MonacoEditor.getModel(uri);
}

export function getModelUri(workspaceId: string, filePath: string): Uri {
  return toUri(workspaceId, filePath);
}

export async function preloadDirectory(
  workspaceId: string,
  filePath: string,
): Promise<void> {
  const dir = filePath.split('/').slice(0, -1).join('/');
  const cacheKey = `${workspaceId}:${dir}`;

  if (preloadedDirs.has(cacheKey)) {
    console.log('[monaco-models] skip preloaded dir:', dir);
    return;
  }
  preloadedDirs.add(cacheKey);

  try {
    const params = new URLSearchParams({ path: dir });
    const res = await fetch(`/api/workspaces/${workspaceId}/files/tree?${params}`);
    const nodes: Array<{ name: string; path: string; type: string; size?: number }> = await res.json();
    console.log('[monaco-models] preload dir:', dir, 'nodes:', nodes.length);

    let count = 0;
    const skipped: string[] = [];
    for (const node of nodes) {
      if (count >= MAX_PRELOAD_FILES) { skipped.push('maxFiles limit'); break; }
      if (node.type !== 'file') continue;

      const ext = '.' + (node.name.split('.').pop()?.toLowerCase() || '');
      if (!PRELOAD_EXTENSIONS.includes(ext)) continue;
      if (node.size && node.size > MAX_PRELOAD_SIZE) { skipped.push(`${node.name} (${(node.size / 1024).toFixed(0)}KB)`); continue; }

      const uri = toUri(workspaceId, node.path);
      if (MonacoEditor.getModel(uri)) { skipped.push(`${node.name} (exists)`); continue; }

      try {
        const contentRes = await fetch(
          `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(node.path)}`
        );
        const data = await contentRes.json();
        if (data.content !== undefined) {
          getOrCreateModel(workspaceId, node.path, data.content);
          count++;
        }
      } catch (e) { skipped.push(`${node.name} (fetch error)`); }
    }
    console.log('[monaco-models] preloaded:', count, 'skipped:', skipped.length ? skipped : 'none');
  } catch (e) {
    console.warn('[monaco-models] preload failed for dir:', dir, e);
  }
}

export function disposeModel(filePath: string): void {
  const model = modelCache.get(filePath);
  if (model) {
    model.dispose();
    modelCache.delete(filePath);
  }
}

export function disposeAll(): void {
  for (const model of modelCache.values()) {
    model.dispose();
  }
  modelCache.clear();
  preloadedDirs.clear();
}

export function setupLanguageDefaults(): void {
  const ts = (languages.typescript as any);
  if (!ts) return;
  ts.typescriptDefaults?.setEagerModelSync(true);
  ts.javascriptDefaults?.setEagerModelSync(true);
  ts.typescriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  });
  ts.javascriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  });
}
