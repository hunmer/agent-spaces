// 判断当前是否运行在 Electron 壳内。
// 优先使用 preload 注入的 window.electronAPI.isElectron 标志位，
// 兼容性回退：window.electron / window.electronAPI / userAgent。
type ElectronWindow = Window & {
  electron?: unknown;
  electronAPI?: { isElectron?: boolean } & Record<string, unknown>;
  require?: unknown;
};

export function isElectronEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as ElectronWindow;
  if (w.electronAPI?.isElectron === true) return true;
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  return Boolean(w.electron || w.electronAPI || userAgent.includes("electron"));
}

// preload 注入的 setup API 类型（仅 setup 流程用到，类型局部化）。
export type ElectronSetupAPI = {
  checkStatus: () => Promise<{ installed: boolean; running: boolean }>;
  install: (registry?: string) => Promise<{ started: boolean }>;
  start: () => Promise<{ ok: boolean; error?: string }>;
  getRegistries: () => Promise<Array<{ value: string; label: string }>>;
  onInstallProgress: (cb: (e: { stream: "stdout" | "stderr"; line: string }) => void) => () => void;
  onInstallDone: (cb: (e: { success: boolean; error?: string }) => void) => () => void;
  onServerLog: (cb: (e: { stream: "stdout" | "stderr"; line: string }) => void) => () => void;
};

export function getElectronSetupAPI(): ElectronSetupAPI | null {
  if (typeof window === "undefined") return null;
  const api = (window as ElectronWindow).electronAPI as { setup?: ElectronSetupAPI } | undefined;
  return api?.setup ?? null;
}
