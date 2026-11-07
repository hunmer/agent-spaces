import type * as Monaco from 'monaco-editor';
import { sdk } from '@/lib/sdk';

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/?([a-zA-Z]):\//, (match, drive: string) => match.replace(drive, drive.toLowerCase()))
    .replace(/\/+$/, '');
}

function safeDecodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function getRootPathCandidates(rootPath: string): string[] {
  if (!/^[a-zA-Z]:\//.test(rootPath)) return [rootPath];
  return [rootPath, `/${rootPath}`];
}

export function getFilePathFromModelPath(modelPath: string | undefined, workspaceId: string): string | null {
  if (!modelPath) return null;
  const workspacePrefix = `/workspace/${workspaceId}/`;
  if (modelPath.startsWith(workspacePrefix)) {
    return decodeURIComponent(modelPath.slice(workspacePrefix.length));
  }
  const plainPrefix = `/${workspaceId}/`;
  if (modelPath.startsWith(plainPrefix)) {
    return decodeURIComponent(modelPath.slice(plainPrefix.length));
  }
  return null;
}

export function getFilePathFromModelUri(
  modelUri: Monaco.Uri | undefined,
  workspaceId: string,
  workspaceRoot?: string,
  inferredWorkspaceRoot?: string | null,
): string | null {
  if (!modelUri) return null;

  const rootPath = normalizePath(workspaceRoot || inferredWorkspaceRoot || '');
  const encodedModelPath = normalizePath(modelUri.path);
  const decodedModelPath = normalizePath(safeDecodePath(modelUri.path));
  for (const candidate of getRootPathCandidates(rootPath)) {
    if (candidate && decodedModelPath.startsWith(`${candidate}/`)) {
      return decodedModelPath.slice(candidate.length + 1);
    }
    if (candidate && encodedModelPath.startsWith(`${candidate}/`)) {
      return safeDecodePath(encodedModelPath.slice(candidate.length + 1));
    }
  }

  return getFilePathFromModelPath(encodedModelPath, workspaceId);
}

export function inferWorkspaceRootFromModelUri(
  modelUri: Monaco.Uri | undefined,
  filePath: string | null,
): string | null {
  if (!modelUri || modelUri.scheme !== 'file' || !filePath) return null;
  const suffix = `/${filePath}`;
  if (!modelUri.path.endsWith(suffix)) return null;
  return decodeURIComponent(modelUri.path.slice(0, -suffix.length));
}

const RESOLVABLE_EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json'];
const RESOLVABLE_INDEX_FILES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.mjs', 'index.cjs', 'index.json'];

function normalizeRelativePath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

async function fileExists(workspaceId: string, path: string): Promise<boolean> {
  try {
    return await sdk.editor.exists(workspaceId, path);
  } catch {
    return false;
  }
}

async function resolveExistingModulePath(workspaceId: string, basePath: string): Promise<string | null> {
  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = `${basePath}${ext}`;
    if (await fileExists(workspaceId, candidate)) return candidate;
  }

  for (const filename of RESOLVABLE_INDEX_FILES) {
    const candidate = `${basePath}/${filename}`;
    if (await fileExists(workspaceId, candidate)) return candidate;
  }

  return null;
}

export function getImportSpecifierAtLine(model: Monaco.editor.ITextModel, lineNumber: number): string | null {
  const line = model.getLineContent(lineNumber);
  const match = line.match(/\bfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/);
  return match?.[1] || match?.[2] || match?.[3] || match?.[4] || null;
}

export async function resolveImportSpecifierPath(
  workspaceId: string,
  sourcePath: string,
  specifier: string,
): Promise<string | null> {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;

  const sourceDir = sourcePath.split('/').slice(0, -1).join('/');
  const srcIndex = sourcePath.split('/').lastIndexOf('src');
  const srcRoot = srcIndex >= 0 ? sourcePath.split('/').slice(0, srcIndex + 1).join('/') : 'src';
  const basePath = specifier.startsWith('@/')
    ? `${srcRoot}/${specifier.slice(2)}`
    : `${sourceDir}/${specifier}`;

  const normalized = normalizeRelativePath(basePath);
  return normalized ? resolveExistingModulePath(workspaceId, normalized) : null;
}

export async function readWorkspaceFile(workspaceId: string, path: string): Promise<string | null> {
  try {
    const data = await sdk.editor.content(workspaceId, path);
    return typeof data.content === 'string' ? data.content : null;
  } catch {
    return null;
  }
}

export function findExportedSymbolPosition(content: string, symbolName: string): { line: number; column: number; endColumn: number } | null {
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\bexport\\s+default\\s+function\\s+(${escaped})\\b`),
    new RegExp(`\\bexport\\s+function\\s+(${escaped})\\b`),
    new RegExp(`\\bexport\\s+(?:const|let|var|class)\\s+(${escaped})\\b`),
    new RegExp(`\\bfunction\\s+(${escaped})\\b`),
    new RegExp(`\\b(?:const|let|var|class)\\s+(${escaped})\\b`),
    new RegExp(`\\bexport\\s+default\\s+(${escaped})\\b`),
  ];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (!match || match.index == null) continue;
      const symbolIndex = match[1] ? line.indexOf(match[1], match.index) : match.index;
      if (symbolIndex < 0) continue;
      return {
        line: lineIndex + 1,
        column: symbolIndex + 1,
        endColumn: symbolIndex + symbolName.length + 1,
      };
    }
  }

  return null;
}

export function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    // Web
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    jsonc: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    vue: "html",
    svg: "xml",
    xml: "xml",
    // Data / Config
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    ini: "ini",
    env: "ini",
    // Scripting
    py: "python",
    pyw: "python",
    rb: "ruby",
    pl: "perl",
    pm: "perl",
    php: "php",
    lua: "lua",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",
    psm1: "powershell",
    bat: "bat",
    cmd: "bat",
    // Systems
    rs: "rust",
    go: "go",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    hh: "cpp",
    hxx: "cpp",
    cs: "csharp",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    swift: "swift",
    dart: "dart",
    scala: "scala",
    // Functional
    hs: "haskell",
    lhs: "haskell",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    clj: "clojure",
    cljs: "clojure",
    // JVM
    groovy: "groovy",
    gradle: "groovy",
    // Markup / Docs
    md: "markdown",
    mdx: "markdown",
    tex: "latex",
    // Database
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    // Other
    dockerfile: "dockerfile",
    r: "r",
    d: "d",
    zig: "zig",
  };
  // Dockerfile / Makefile by filename
  const name = path.split("/").pop()?.toLowerCase() || "";
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  if (name === "makefile" || name === "gnumakefile") return "makefile";
  if (name === "cmakelists.txt" || name.endsWith(".cmake")) return "cmake";
  if (name === ".gitignore" || name === ".dockerignore" || name === ".eslintignore") return "plaintext";
  return map[ext || ""] || "plaintext";
}
