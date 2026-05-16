interface ShellOption {
  value: string;
  label: string;
}

const MAC_SHELLS: ShellOption[] = [
  { value: '/bin/zsh', label: 'zsh' },
  { value: '/bin/bash', label: 'bash' },
];

const WIN_SHELLS: ShellOption[] = [
  { value: 'cmd.exe', label: 'CMD' },
  { value: 'powershell.exe', label: 'PowerShell' },
];

let cachedOptions: ShellOption[] | null = null;

export async function getShellOptions(): Promise<ShellOption[]> {
  if (cachedOptions) return cachedOptions;
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    cachedOptions = data.platform === 'win32' ? WIN_SHELLS : MAC_SHELLS;
  } catch {
    cachedOptions = MAC_SHELLS;
  }
  return cachedOptions;
}

export function getShellLabel(shell?: string, options?: ShellOption[]): string {
  const opts = options?.length ? options : MAC_SHELLS;
  if (!shell) return opts[0].label;
  return opts.find((s) => s.value === shell)?.label ?? shell;
}
