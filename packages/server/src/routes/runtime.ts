import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from '@agent-spaces/shared';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');
const workspaceRootDir = join(rootDir, '../..');
const requireFromRoot = createRequire(join(rootDir, 'package.json'));

type SupportedRuntimeKind = Extract<NonNullable<AgentConfig['runtimeKind']>, 'claude-code' | 'codex' | 'open-agent-sdk'>;
type InstallableRuntimePackageId = RuntimeDescriptor['id'];
type RuntimeCategory = 'cli' | 'sdk';

interface RuntimeDescriptor {
  id: 'claude-code' | 'codex' | 'gemini-cli' | 'claude-code-sdk' | 'codex-sdk' | 'open-agent-sdk';
  category: RuntimeCategory;
  label: string;
  commands?: string[];
  runtimeKind?: SupportedRuntimeKind;
  packageName?: string;
}

interface RuntimeCheckUpdateRequestBody {
  runtimeId?: InstallableRuntimePackageId;
}

const RUNTIME_DESCRIPTORS: RuntimeDescriptor[] = [
  {
    id: 'claude-code',
    category: 'cli',
    label: 'Claude Code CLI',
    commands: ['claude'],
    runtimeKind: 'claude-code',
  },
  {
    id: 'codex',
    category: 'cli',
    label: 'Codex CLI',
    commands: ['codex'],
    runtimeKind: 'codex',
  },
  {
    id: 'gemini-cli',
    category: 'cli',
    label: 'Gemini CLI',
    commands: ['gemini'],
  },
  {
    id: 'claude-code-sdk',
    category: 'sdk',
    label: 'Claude Code SDK',
    runtimeKind: 'claude-code',
    packageName: '@anthropic-ai/claude-agent-sdk',
  },
  {
    id: 'codex-sdk',
    category: 'sdk',
    label: 'Codex SDK',
    runtimeKind: 'codex',
    packageName: '@openai/codex-sdk',
  },
  {
    id: 'open-agent-sdk',
    category: 'sdk',
    label: 'Open Agent SDK',
    runtimeKind: 'open-agent-sdk',
    packageName: '@codeany/open-agent-sdk',
  },
];

router.post('/discover-cli', async (_req: Request, res: Response) => {
  const items = await Promise.all(RUNTIME_DESCRIPTORS.map(discoverRuntime));
  res.json({ items });
});

router.post('/install-cli', async (req: Request, res: Response) => {
  const runtimeId = req.body?.runtimeId;
  if (
    runtimeId !== 'claude-code-sdk'
    && runtimeId !== 'codex-sdk'
    && runtimeId !== 'open-agent-sdk'
  ) {
    res.status(400).json({ error: 'runtimeId must be claude-code-sdk, codex-sdk, or open-agent-sdk' });
    return;
  }

  const descriptor = RUNTIME_DESCRIPTORS.find(
    (item): item is RuntimeDescriptor & { id: InstallableRuntimePackageId } => item.id === runtimeId,
  );
  if (descriptor?.category !== 'sdk' || !descriptor.packageName) {
    res.status(400).json({ error: `runtime ${runtimeId} is not installable` });
    return;
  }

  try {
    const packageManager = resolvePackageManager();
    const packageSpec = `${descriptor.packageName}@latest`;
    const args = packageManager === 'pnpm'
      ? ['add', packageSpec]
      : ['install', packageSpec];
    const result = await runCommand(packageManager, args, rootDir);
    const items = await Promise.all(RUNTIME_DESCRIPTORS.map(discoverRuntime));
    res.json({
      ok: true,
      runtimeId,
      packageManager,
      packages: [packageSpec],
      stdout: result.stdout,
      stderr: result.stderr,
      items,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to install runtime package',
    });
  }
});

router.post('/check-sdk-updates', async (req: Request, res: Response) => {
  const runtimeId = (req.body as RuntimeCheckUpdateRequestBody | undefined)?.runtimeId;
  const targets = RUNTIME_DESCRIPTORS.filter((item) => (
    item.category === 'sdk'
    && item.packageName
    && (!runtimeId || item.id === runtimeId)
  ));

  try {
    const updates = await Promise.all(targets.map(async (item) => ({
      runtimeId: item.id,
      latestVersion: item.packageName ? await fetchLatestPackageVersion(item.packageName) : null,
    })));
    res.json({ updates });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to check sdk updates',
    });
  }
});

async function discoverRuntime(descriptor: RuntimeDescriptor) {
  if (descriptor.category === 'sdk' && descriptor.packageName) {
    const installed = readInstalledPackage(descriptor.packageName);
    return {
      id: descriptor.id,
      category: descriptor.category,
      label: descriptor.label,
      command: descriptor.packageName,
      found: Boolean(installed),
      path: installed?.path ?? null,
      version: installed?.version ?? null,
      runtimeKind: descriptor.runtimeKind ?? null,
      supportedRuntime: Boolean(descriptor.runtimeKind),
    };
  }

  for (const command of descriptor.commands ?? []) {
    const path = await locateCommand(command);
    if (!path) continue;
    return {
      id: descriptor.id,
      category: descriptor.category,
      label: descriptor.label,
      command,
      found: true,
      path,
      version: null,
      runtimeKind: descriptor.runtimeKind ?? null,
      supportedRuntime: Boolean(descriptor.runtimeKind),
    };
  }

  return {
    id: descriptor.id,
    category: descriptor.category,
    label: descriptor.label,
    command: descriptor.commands?.[0] ?? descriptor.packageName ?? descriptor.id,
    found: false,
    path: null,
    version: null,
    runtimeKind: descriptor.runtimeKind ?? null,
    supportedRuntime: Boolean(descriptor.runtimeKind),
  };
}

function locateCommand(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const child = spawn(isWin ? 'where.exe' : 'which', [command], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const firstLine = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      resolve(firstLine ?? null);
    });
  });
}

function locatePackage(packageName: string): string | null {
  const directCandidates = [
    resolve(rootDir, 'node_modules', ...packageName.split('/'), 'package.json'),
    resolve(workspaceRootDir, 'node_modules', ...packageName.split('/'), 'package.json'),
  ];
  for (const directPath of directCandidates) {
    if (existsSync(directPath)) return directPath;
  }

  try {
    const entryPath = requireFromRoot.resolve(packageName);
    return findPackageJsonPath(entryPath, packageName);
  } catch {
    return null;
  }
}

function readInstalledPackage(packageName: string): { path: string; version: string | null } | null {
  const path = locatePackage(packageName);
  if (!path) return null;
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
    return {
      path,
      version: typeof pkg.version === 'string' ? pkg.version : null,
    };
  } catch {
    return { path, version: null };
  }
}

function findPackageJsonPath(entryPath: string, packageName: string): string | null {
  let currentDir = dirname(entryPath);
  const root = dirname(currentDir);

  while (currentDir !== root) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
        if (pkg.name === packageName) return packageJsonPath;
      } catch {
        // Ignore malformed package.json and continue upward.
      }
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

function resolvePackageManager() {
  if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(rootDir, 'package-lock.json'))) return 'npm';
  return 'npm';
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} ${args.join(' ')} failed with code ${code}`));
    });
  });
}

async function fetchLatestPackageVersion(packageName: string): Promise<string | null> {
  try {
    const result = await runCommand('npm', ['view', packageName, 'version'], rootDir);
    const version = result.stdout.trim().split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return version ?? null;
  } catch {
    return null;
  }
}

export default router;
