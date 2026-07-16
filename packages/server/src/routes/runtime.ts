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

type SupportedRuntimeKind = Extract<NonNullable<AgentConfig['runtimeKind']>, 'claude-code' | 'codex' | 'grok' | 'open-agent-sdk' | 'hermes' | 'pi'>;
type InstallableRuntimePackageId = RuntimeDescriptor['id'];
type RuntimeCategory = 'cli' | 'sdk';
type VersionSource = { type: 'npm'; packageName: string } | { type: 'github'; repo: string };
type InstallCommandSpec = {
  command: string;
  args: string[];
  cwd: string;
  packageManagerLabel: string;
};

interface RuntimeDescriptor {
  id: 'claude-code' | 'codex' | 'grok' | 'gemini-cli' | 'hermes' | 'pi' | 'claude-code-sdk' | 'codex-sdk' | 'open-agent-sdk';
  category: RuntimeCategory;
  label: string;
  commands?: string[];
  runtimeKind?: SupportedRuntimeKind;
  packageName?: string;
  versionArgs?: string[];
  versionSource?: VersionSource;
  installable?: boolean;
  updateCommand?: Omit<InstallCommandSpec, 'packageManagerLabel'>;
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
    versionArgs: ['--version'],
    versionSource: { type: 'github', repo: 'anthropics/claude-code' },
    installable: true,
    updateCommand: {
      command: 'claude',
      args: ['update'],
      cwd: rootDir,
    },
  },
  {
    id: 'codex',
    category: 'cli',
    label: 'Codex CLI',
    commands: ['codex'],
    runtimeKind: 'codex',
    versionArgs: ['--version'],
    versionSource: { type: 'github', repo: 'openai/codex' },
    installable: true,
    updateCommand: {
      command: 'codex',
      args: ['update'],
      cwd: rootDir,
    },
  },
  {
    id: 'grok',
    category: 'cli',
    label: 'Grok CLI',
    commands: ['grok'],
    runtimeKind: 'grok',
    versionArgs: ['--version'],
    installable: false,
  },
  {
    id: 'gemini-cli',
    category: 'cli',
    label: 'Gemini CLI',
    commands: ['gemini'],
    versionArgs: ['--version'],
    versionSource: { type: 'npm', packageName: '@google/gemini-cli' },
    installable: true,
    updateCommand: {
      command: 'npm',
      args: ['update', '-g', '@google/gemini-cli'],
      cwd: rootDir,
    },
  },
  {
    id: 'hermes',
    category: 'cli',
    label: 'Hermes CLI',
    commands: ['hermes'],
    runtimeKind: 'hermes',
    versionArgs: ['--version'],
    versionSource: { type: 'github', repo: 'NousResearch/hermes-agent' },
    installable: true,
  },
  {
    id: 'pi',
    category: 'sdk',
    label: 'Pi SDK',
    runtimeKind: 'pi',
    packageName: '@earendil-works/pi-coding-agent',
    installable: false,
  },
  {
    id: 'claude-code-sdk',
    category: 'sdk',
    label: 'Claude Code SDK',
    runtimeKind: 'claude-code',
    packageName: '@anthropic-ai/claude-agent-sdk',
    versionSource: { type: 'npm', packageName: '@anthropic-ai/claude-agent-sdk' },
    installable: true,
  },
  {
    id: 'codex-sdk',
    category: 'sdk',
    label: 'Codex SDK',
    runtimeKind: 'codex',
    packageName: '@openai/codex-sdk',
    versionSource: { type: 'npm', packageName: '@openai/codex-sdk' },
    installable: true,
  },
  {
    id: 'open-agent-sdk',
    category: 'sdk',
    label: 'Open Agent SDK',
    runtimeKind: 'open-agent-sdk',
    packageName: '@codeany/open-agent-sdk',
    versionSource: { type: 'npm', packageName: '@codeany/open-agent-sdk' },
    installable: true,
  },
];

router.post('/discover-cli', async (_req: Request, res: Response) => {
  const items = await Promise.all(RUNTIME_DESCRIPTORS.map(discoverRuntime));
  res.json({ items });
});

router.post('/install-cli', async (req: Request, res: Response) => {
  const runtimeId = req.body?.runtimeId;
  const descriptor = RUNTIME_DESCRIPTORS.find(
    (item): item is RuntimeDescriptor & { id: InstallableRuntimePackageId } => item.id === runtimeId,
  );
  if (!descriptor?.installable) {
    res.status(400).json({ error: `runtime ${runtimeId} is not installable` });
    return;
  }

  try {
    const installedPath = descriptor.category === 'cli' ? await locateRuntimeCommand(descriptor) : null;
    const installCommand = resolveRuntimeInstallCommand(descriptor, Boolean(installedPath));
    const packageSpec = descriptor.packageName ? `${descriptor.packageName}@latest` : descriptor.label;
    const result = await runCommand(installCommand.command, installCommand.args, installCommand.cwd);
    const items = await Promise.all(RUNTIME_DESCRIPTORS.map(discoverRuntime));
    res.json({
      ok: true,
      runtimeId,
      packageManager: installCommand.packageManagerLabel,
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
    item.installable
    && item.versionSource
    && (!runtimeId || item.id === runtimeId)
  ));

  try {
    const updates = await Promise.all(targets.map(async (item) => {
      const result = await fetchLatestVersion(item);
      return {
        runtimeId: item.id,
        latestVersion: result.latestVersion,
        debug: result.debug,
      };
    }));
    console.log('[runtime] check-sdk-updates', JSON.stringify({ runtimeId: runtimeId ?? 'all', updates }, null, 2));
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

  const path = await locateRuntimeCommand(descriptor);
  if (path) {
    const version = await readInstalledCliVersion(descriptor, path);
    return {
      id: descriptor.id,
      category: descriptor.category,
      label: descriptor.label,
      command: descriptor.commands?.[0] ?? descriptor.id,
      found: true,
      path,
      version,
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

async function locateRuntimeCommand(descriptor: RuntimeDescriptor): Promise<string | null> {
  for (const command of descriptor.commands ?? []) {
    const path = await locateCommand(command);
    if (path) return path;
  }

  if (descriptor.id === 'hermes') {
    return resolveWindowsInstalledCliPath('HERMES_CLI_PATH', [
      ['hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'],
      ['AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'],
    ]);
  }

  if (descriptor.id === 'grok') {
    return resolveWindowsInstalledCliPath('GROK_CLI_PATH', [
      ['.grok', 'bin', 'grok.exe'],
    ]);
  }

  return null;
}

function resolveWindowsInstalledCliPath(configEnvName: 'HERMES_CLI_PATH' | 'GROK_CLI_PATH', relativeCandidates: string[][]): string | null {
  const configured = process.env[configEnvName]?.trim();
  if (configured && existsSync(configured)) return configured;
  if (process.platform !== 'win32') return null;

  const bases = [process.env.LOCALAPPDATA, process.env.USERPROFILE].filter((value): value is string => Boolean(value));
  for (const base of bases) {
    for (const parts of relativeCandidates) {
      const candidate = join(base, ...parts);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function readInstalledCliVersion(descriptor: RuntimeDescriptor, commandPath: string): Promise<string | null> {
  const versionArgs = descriptor.versionArgs;
  if (!versionArgs || versionArgs.length === 0) return null;

  try {
    const result = await runCommand(commandPath, versionArgs, rootDir);
    return extractNormalizedVersion(result.stdout || result.stderr);
  } catch {
    return null;
  }
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

function resolveInstallTarget(): { packageManager: 'pnpm' | 'npm'; cwd: string } {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction && existsSync(join(workspaceRootDir, 'pnpm-lock.yaml'))) {
    return {
      packageManager: 'pnpm',
      cwd: workspaceRootDir,
    };
  }

  if (existsSync(join(rootDir, 'package-lock.json'))) {
    return {
      packageManager: 'npm',
      cwd: rootDir,
    };
  }

  if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) {
    return {
      packageManager: 'pnpm',
      cwd: rootDir,
    };
  }

  return {
    packageManager: 'npm',
    cwd: rootDir,
  };
}

function resolveRuntimeInstallCommand(descriptor: RuntimeDescriptor, alreadyInstalled = false): InstallCommandSpec {
  if (descriptor.category === 'sdk' && descriptor.packageName) {
    const installTarget = resolveInstallTarget();
    const packageSpec = `${descriptor.packageName}@latest`;
    return installTarget.packageManager === 'pnpm'
      ? {
          command: 'pnpm',
          args: ['--filter', '@agent-spaces/server', 'add', packageSpec],
          cwd: installTarget.cwd,
          packageManagerLabel: 'pnpm',
        }
      : {
          command: 'npm',
          args: ['install', packageSpec],
          cwd: installTarget.cwd,
          packageManagerLabel: 'npm',
        };
  }

  if (alreadyInstalled && descriptor.updateCommand) {
    return {
      ...descriptor.updateCommand,
      packageManagerLabel: descriptor.updateCommand.command,
    };
  }

  if (descriptor.id === 'claude-code') {
    return process.platform === 'win32'
      ? {
          command: 'powershell.exe',
          args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'],
          cwd: rootDir,
          packageManagerLabel: 'powershell',
        }
      : {
          command: 'sh',
          args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'],
          cwd: rootDir,
          packageManagerLabel: 'shell',
        };
  }

  if (descriptor.id === 'codex') {
    return process.platform === 'win32'
      ? {
          command: 'powershell.exe',
          args: ['-ExecutionPolicy', 'ByPass', '-c', 'irm https://chatgpt.com/codex/install.ps1 | iex'],
          cwd: rootDir,
          packageManagerLabel: 'powershell',
        }
      : {
          command: 'sh',
          args: ['-c', 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'],
          cwd: rootDir,
          packageManagerLabel: 'shell',
        };
  }

  if (descriptor.id === 'gemini-cli') {
    return {
      command: 'npm',
      args: ['install', '-g', '@google/gemini-cli'],
      cwd: rootDir,
      packageManagerLabel: 'npm',
    };
  }

  if (descriptor.id === 'hermes') {
    return process.platform === 'win32'
      ? {
          command: 'powershell.exe',
          args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)'],
          cwd: rootDir,
          packageManagerLabel: 'powershell',
        }
      : {
          command: 'sh',
          args: ['-c', 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'],
          cwd: rootDir,
          packageManagerLabel: 'shell',
        };
  }

  throw new Error(`runtime ${descriptor.id} is not installable`);
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const resolvedCommand = resolveExecutable(command);
    const child = process.platform === 'win32' && (resolvedCommand.endsWith('.cmd') || resolvedCommand.endsWith('.bat'))
      ? spawn('cmd.exe', ['/d', '/s', '/c', buildWindowsCommandLine(resolvedCommand, args)], {
          cwd,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
      : spawn(resolvedCommand, args, {
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

async function fetchLatestPackageVersion(packageName: string): Promise<{
  latestVersion: string | null;
  debug: {
    packageName: string;
    command: string;
    cwd: string;
    stdout: string;
    stderr: string;
    error: string | null;
  };
}> {
  const command = resolveExecutable('npm');
  try {
    const result = await runCommand('npm', ['view', packageName, 'version'], rootDir);
    const version = result.stdout.trim().split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return {
      latestVersion: version ?? null,
      debug: {
        packageName,
        command: `${command} view ${packageName} version`,
        cwd: rootDir,
        stdout: result.stdout,
        stderr: result.stderr,
        error: null,
      },
    };
  } catch (error) {
    return {
      latestVersion: null,
      debug: {
        packageName,
        command: `${command} view ${packageName} version`,
        cwd: rootDir,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchLatestGithubReleaseVersion(repo: string): Promise<{
  latestVersion: string | null;
  debug: {
    packageName: string;
    command: string;
    cwd: string;
    stdout: string;
    stderr: string;
    error: string | null;
  };
}> {
  const command = `GET https://api.github.com/repos/${repo}/releases/latest`;
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'agent-spaces-runtime-checker',
      },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`github latest release request failed: ${response.status}`);
    }
    const parsed = JSON.parse(body) as { tag_name?: unknown; name?: unknown };
    const version = extractNormalizedVersion(
      typeof parsed.tag_name === 'string'
        ? parsed.tag_name
        : typeof parsed.name === 'string'
          ? parsed.name
          : '',
    );
    return {
      latestVersion: version,
      debug: {
        packageName: repo,
        command,
        cwd: rootDir,
        stdout: body,
        stderr: '',
        error: null,
      },
    };
  } catch (error) {
    return {
      latestVersion: null,
      debug: {
        packageName: repo,
        command,
        cwd: rootDir,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function fetchLatestVersion(descriptor: RuntimeDescriptor) {
  if (!descriptor.versionSource) {
    return Promise.resolve({
      latestVersion: null,
      debug: {
        packageName: descriptor.packageName ?? descriptor.id,
        command: '',
        cwd: rootDir,
        stdout: '',
        stderr: '',
        error: 'missing versionSource',
      },
    });
  }

  return descriptor.versionSource.type === 'npm'
    ? fetchLatestPackageVersion(descriptor.versionSource.packageName)
    : fetchLatestGithubReleaseVersion(descriptor.versionSource.repo);
}

function extractNormalizedVersion(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/v?\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?/);
  return match ? match[0].replace(/^v/i, '') : trimmed.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function resolveExecutable(command: string): string {
  if (process.platform !== 'win32') return command;
  if (command.endsWith('.exe') || command.endsWith('.cmd') || command.endsWith('.bat')) return command;
  if (command === 'npm' || command === 'pnpm') return `${command}.cmd`;
  return command;
}

function buildWindowsCommandLine(command: string, args: string[]): string {
  return [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(' ');
}

function quoteWindowsArg(value: string): string {
  if (value.length === 0) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

export default router;
