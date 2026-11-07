// 应用全局自定义鼠标光标：样式定义 + localStorage 持久化 + 变更事件。
// 由 code_artifact.html（Cursor Studio）迁移而来。

export const CURSOR_STYLE_KEY = "cursor-style";
export const CURSOR_SOUND_KEY = "cursor-sound";
export const CURSOR_TRAIL_KEY = "cursor-trail";

/** 设置变化后派发的事件名（window CustomEvent），全局光标组件监听以热更新 */
export const CURSOR_CHANGE_EVENT = "agent-spaces-cursor-change";

export interface CursorStyleConfig {
  key: string;
  name: string;
  colorLight: string;
  colorDark: string;
  freq: number;
  innerSize: number;
  outerSize: number;
  lerp: number;
}

export const CURSOR_STYLES: CursorStyleConfig[] = [
  {
    key: "ring",
    name: "01 / 极简磁吸环",
    colorLight: "#4f46e5",
    colorDark: "#818cf8",
    freq: 520,
    innerSize: 7,
    outerSize: 34,
    lerp: 0.18,
  },
  {
    key: "ribbon",
    name: "02 / 流光丝带",
    colorLight: "#0891b2",
    colorDark: "#22d3ee",
    freq: 680,
    innerSize: 10,
    outerSize: 26,
    lerp: 0.24,
  },
  {
    key: "crosshair",
    name: "03 / 战术准星",
    colorLight: "#059669",
    colorDark: "#34d399",
    freq: 880,
    innerSize: 6,
    outerSize: 36,
    lerp: 0.22,
  },
  {
    key: "stardust",
    name: "04 / 星尘微粒",
    colorLight: "#d97706",
    colorDark: "#fbbf24",
    freq: 760,
    innerSize: 9,
    outerSize: 30,
    lerp: 0.16,
  },
  {
    key: "fluid",
    name: "05 / 弹性流体",
    colorLight: "#e11d48",
    colorDark: "#fb7185",
    freq: 360,
    innerSize: 12,
    outerSize: 38,
    lerp: 0.14,
  },
];

const DEFAULT_TRAIL_PERCENT = 100;

const internal = {
  style: "",
  sound: false,
  trail: DEFAULT_TRAIL_PERCENT / 100,
};

export function getCursorStyleKey(): string {
  return internal.style;
}

export function getCursorStyle(): CursorStyleConfig | null {
  if (!internal.style) return null;
  return CURSOR_STYLES.find((s) => s.key === internal.style) ?? null;
}

export function isCursorSoundEnabled(): boolean {
  return internal.sound;
}

/** 拖尾长度倍率（0.3 - 1.8） */
export function getCursorTrailMultiplier(): number {
  return internal.trail;
}

/** 拖尾长度百分比（30 - 180），供设置界面回显 */
export function getCursorTrailPercent(): number {
  return Math.round(internal.trail * 100);
}

function applyRootFlag() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (internal.style) root.setAttribute("data-custom-cursor", internal.style);
  else root.removeAttribute("data-custom-cursor");
}

function emitChange() {
  applyRootFlag();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CURSOR_CHANGE_EVENT));
  }
}

/** 从 localStorage 恢复设置（挂载时调用一次） */
export function loadCursorSettings() {
  if (typeof window === "undefined") return;
  try {
    const saved = localStorage.getItem(CURSOR_STYLE_KEY) || "";
    internal.style = CURSOR_STYLES.some((s) => s.key === saved) ? saved : "";
    internal.sound = localStorage.getItem(CURSOR_SOUND_KEY) === "on";
    const trail = parseInt(localStorage.getItem(CURSOR_TRAIL_KEY) || "", 10);
    const clamped = Number.isFinite(trail)
      ? Math.min(180, Math.max(30, trail))
      : DEFAULT_TRAIL_PERCENT;
    internal.trail = clamped / 100;
  } catch {
    // 忽略损坏的 localStorage 数据
  }
  applyRootFlag();
}

/** 设置光标样式；传空字符串恢复系统默认 */
export function setCursorStyle(key: string) {
  if (key !== "" && !CURSOR_STYLES.some((s) => s.key === key)) return;
  internal.style = key;
  if (typeof window !== "undefined") {
    if (key) localStorage.setItem(CURSOR_STYLE_KEY, key);
    else localStorage.removeItem(CURSOR_STYLE_KEY);
  }
  emitChange();
}

export function setCursorSoundEnabled(enabled: boolean) {
  internal.sound = enabled;
  if (typeof window !== "undefined") {
    localStorage.setItem(CURSOR_SOUND_KEY, enabled ? "on" : "off");
  }
  emitChange();
}

/** 传入百分比（30 - 180） */
export function setCursorTrailPercent(percent: number) {
  const clamped = Math.min(180, Math.max(30, Math.round(percent)));
  internal.trail = clamped / 100;
  if (typeof window !== "undefined") {
    localStorage.setItem(CURSOR_TRAIL_KEY, String(clamped));
  }
  emitChange();
}
