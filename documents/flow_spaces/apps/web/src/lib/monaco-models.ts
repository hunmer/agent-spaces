import { editor as MonacoEditor, Uri } from 'monaco-editor';

const modelCache = new Map<string, MonacoEditor.ITextModel>();

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

export function getModel(workspaceId: string, filePath: string, workspaceRoot?: string): MonacoEditor.ITextModel | null {
  const uri = toUri(workspaceId, filePath, workspaceRoot);
  return MonacoEditor.getModel(uri);
}

export function getModelUri(workspaceId: string, filePath: string, workspaceRoot?: string): Uri {
  return toUri(workspaceId, filePath, workspaceRoot);
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
}
