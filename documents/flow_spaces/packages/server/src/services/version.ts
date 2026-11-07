import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let localVersion = '';
let cachedLatest: { version: string; ts: number } | null = null;
const CACHE_TTL = 3600_000; // 1 hour

export function getLocalVersion(): string {
  if (localVersion !== '') return localVersion;

  const packageJsonPaths = [
    join(__dirname, '..', '..', 'package.json'),
    join(__dirname, '..', 'package.json'),
  ];

  for (const packageJsonPath of packageJsonPaths) {
    if (!existsSync(packageJsonPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      localVersion = pkg.version || '0.0.0';
      return localVersion;
    } catch {
      // Try the next package.json candidate before falling back.
    }
  }

  localVersion = '0.0.0';
  return localVersion;
}

export function getCachedLatest(): string | null {
  if (cachedLatest && Date.now() - cachedLatest.ts < CACHE_TTL) {
    return cachedLatest.version;
  }
  return null;
}

export async function fetchLatestVersion(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedLatest && Date.now() - cachedLatest.ts < CACHE_TTL) {
    return cachedLatest.version;
  }
  try {
    const res = await fetch('https://registry.npmjs.org/@agent-spaces/server', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return cachedLatest?.version ?? null;
    const data = await res.json() as any;
    const latest = data?.['dist-tags']?.latest;
    if (latest) {
      cachedLatest = { version: latest, ts: Date.now() };
    }
    return latest ?? cachedLatest?.version ?? null;
  } catch {
    return cachedLatest?.version ?? null;
  }
}

export function isNewerVersion(latest: string, local: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const a = parse(latest);
  const b = parse(local);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}
