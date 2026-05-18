import { editor as MonacoEditor, Uri, languages } from 'monaco-editor';

const PRELOAD_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const MAX_PRELOAD_FILES = 20;
const MAX_PRELOAD_SIZE = 500 * 1024; // 500KB

const modelCache = new Map<string, MonacoEditor.ITextModel>();
const preloadedDirs = new Set<string>();
let languageDefaultsConfigured = false;

function getLanguageFromPath(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    // Web
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', jsonc: 'json',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', vue: 'html',
    svg: 'xml', xml: 'xml',
    // Data / Config
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini', ini: 'ini', env: 'ini',
    // Scripting
    py: 'python', pyw: 'python',
    rb: 'ruby', pl: 'perl', pm: 'perl',
    php: 'php', lua: 'lua',
    sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
    ps1: 'powershell', psm1: 'powershell',
    bat: 'bat', cmd: 'bat',
    // Systems
    rs: 'rust', go: 'go',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
    cs: 'csharp', java: 'java',
    kt: 'kotlin', kts: 'kotlin',
    swift: 'swift', dart: 'dart', scala: 'scala',
    // Functional
    hs: 'haskell', lhs: 'haskell',
    ex: 'elixir', exs: 'elixir',
    erl: 'erlang',
    clj: 'clojure', cljs: 'clojure',
    // JVM
    groovy: 'groovy', gradle: 'groovy',
    // Markup / Docs
    md: 'markdown', mdx: 'markdown', tex: 'latex',
    // Database
    sql: 'sql',
    graphql: 'graphql', gql: 'graphql',
    // Other
    r: 'r', d: 'd', zig: 'zig',
    dockerfile: 'dockerfile',
  };
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile';
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile';
  if (name === 'cmakelists.txt' || name.endsWith('.cmake')) return 'cmake';
  return map[ext] || 'plaintext';
}

function toUri(workspaceId: string, filePath: string, workspaceRoot?: string): Uri {
  if (workspaceRoot) {
    return Uri.file(`${workspaceRoot.replace(/\/+$/, '')}/${filePath}`);
  }
  return Uri.parse(`file:///workspace/${workspaceId}/${filePath}`);
}

export function getOrCreateModel(
  workspaceId: string,
  filePath: string,
  content: string | undefined,
  workspaceRoot?: string,
): MonacoEditor.ITextModel {
  const safeContent = content ?? '';
  const uri = toUri(workspaceId, filePath, workspaceRoot);
  let model = MonacoEditor.getModel(uri);

  if (!model) {
    model = MonacoEditor.createModel(safeContent, getLanguageFromPath(filePath), uri);
  } else {
    if (model.getValue() !== safeContent) {
      model.setValue(safeContent);
    }
  }

  modelCache.set(filePath, model);
  return model;
}

export function getModel(workspaceId: string, filePath: string): MonacoEditor.ITextModel | null {
  const uri = toUri(workspaceId, filePath);
  return MonacoEditor.getModel(uri);
}

export function getModelUri(workspaceId: string, filePath: string, workspaceRoot?: string): Uri {
  return toUri(workspaceId, filePath, workspaceRoot);
}

export async function preloadDirectory(
  workspaceId: string,
  filePath: string,
  workspaceRoot?: string,
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

      const uri = toUri(workspaceId, node.path, workspaceRoot);
      if (MonacoEditor.getModel(uri)) { skipped.push(`${node.name} (exists)`); continue; }

      try {
        const contentRes = await fetch(
          `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(node.path)}`
        );
        const data = await contentRes.json();
        if (data.content !== undefined) {
          getOrCreateModel(workspaceId, node.path, data.content, workspaceRoot);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (languages.typescript as any);
  if (!ts || languageDefaultsConfigured) return;
  languageDefaultsConfigured = true;

  const compilerOptions = {
    target: ts.ScriptTarget?.ES2020,
    module: ts.ModuleKind?.ESNext,
    moduleResolution: ts.ModuleResolutionKind?.NodeJs,
    jsx: ts.JsxEmit?.ReactJSX,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    esModuleInterop: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    typeRoots: ['node_modules/@types'],
    paths: {
      '@/*': ['src/*'],
    },
  };

  ts.typescriptDefaults?.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults?.setCompilerOptions(compilerOptions);
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
