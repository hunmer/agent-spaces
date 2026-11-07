import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';

export interface DshSpawnSpec {
  command: string;
  args: string[];
}

/** An explicit override is authoritative, including when it is invalid. */
export function resolveDshCommand(): string {
  const configured = process.env.DSH_CLI_PATH?.trim();
  if (configured) return configured;
  if (process.platform === 'win32') {
    const candidates = [
      process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'dsh.cmd') : undefined,
      process.env.USERPROFILE ? join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm', 'dsh.cmd') : undefined,
    ];
    const installed = candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
    if (installed) return installed;
  }
  return 'dsh';
}

/** Never concatenate the task into a shell command, especially on Windows. */
export function buildDshSpawnSpec(command: string, args: string[]): DshSpawnSpec {
  if (/\.(?:c?js|mjs)$/i.test(command)) {
    return { command: process.execPath, args: [command, ...args] };
  }
  if (process.platform !== 'win32') return { command, args: [...args] };

  const executable = findWindowsCommand(command);
  const extension = extname(executable).toLowerCase();
  if (extension === '.cmd' || extension === '.bat' || extension === '') {
    const entry = resolveNpmDshEntry(executable);
    if (entry) return { command: process.execPath, args: [entry, ...args] };
    if (extension === '.cmd' || extension === '.bat' || existsSync(executable)) {
      throw new Error('DSH batch launcher cannot safely receive a full prompt. Set DSH_CLI_PATH to the installed @deepseek-ai/dsh/lib/bin.js entry or a native executable.');
    }
  }
  return { command: executable, args: [...args] };
}

function findWindowsCommand(command: string): string {
  if (isAbsolute(command) || /[\\/]/.test(command)) return command;
  const path = process.env.PATH ?? process.env.Path ?? '';
  const extensions = extname(command) ? [''] : ['.exe', '.com', '.cmd', '.bat', ''];
  for (const directory of path.split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = resolve(directory.replace(/^"|"$/g, ''), `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return command;
}

function resolveNpmDshEntry(command: string): string | undefined {
  const entry = join(dirname(command), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!existsSync(entry)) return undefined;
  try {
    // Only unwrap an actual DSH npm shim, not an unrelated custom batch file.
    const shim = readFileSync(command, 'utf8').replace(/\\+/g, '/');
    return shim.includes('node_modules/@deepseek-ai/dsh/lib/bin.js') ? entry : undefined;
  } catch {
    return undefined;
  }
}
