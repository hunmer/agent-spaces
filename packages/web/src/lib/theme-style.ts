export const THEME_STYLE_STORAGE_KEY = "theme-style";
export const THEME_STYLE_CUSTOM_CSS_KEY = "theme-style-custom-css";
const STYLE_EL_ID = "theme-style-override";
const FONT_LINK_EL_ID = "theme-style-google-fonts";
const FONT_PRECONNECT_EL_ID = "theme-style-google-fonts-preconnect";
const FONT_PRECONNECT_STATIC_EL_ID = "theme-style-google-fonts-static-preconnect";
const THEME_FONT_VARIABLES = ["sans", "serif", "mono", "app", "heading", "mid"];
const APP_FONT_VARIABLES = ["sans", "serif", "mono", "heading", "mid"];
const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "emoji",
  "math",
  "fangsong",
]);
const SYSTEM_FONT_FAMILIES = new Set([
  "-apple-system",
  "arial",
  "blinkmacsystemfont",
  "cambria",
  "consolas",
  "courier new",
  "georgia",
  "helvetica",
  "helvetica neue",
  "menlo",
  "segoe ui",
  "sf mono",
  "sfmono-regular",
  "times",
  "times new roman",
]);

export const THEME_STYLES: Record<string, string> = {
  mira: `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}`,

  lyra: `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}`,

  luma: `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.147 0.004 49.3);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.147 0.004 49.3);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.147 0.004 49.3);
  --primary: oklch(0.505 0.213 27.518);
  --primary-foreground: oklch(0.971 0.013 17.38);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.96 0.002 17.2);
  --muted-foreground: oklch(0.547 0.021 43.1);
  --accent: oklch(0.96 0.002 17.2);
  --accent-foreground: oklch(0.214 0.009 43.1);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0.005 34.3);
  --input: oklch(0.922 0.005 34.3);
  --ring: oklch(0.714 0.014 41.2);
  --chart-1: oklch(0.868 0.007 39.5);
  --chart-2: oklch(0.547 0.021 43.1);
  --chart-3: oklch(0.438 0.017 39.3);
  --chart-4: oklch(0.367 0.016 35.7);
  --chart-5: oklch(0.268 0.011 36.5);
  --radius: 0.875rem;
  --sidebar: oklch(0.986 0.002 67.8);
  --sidebar-foreground: oklch(0.147 0.004 49.3);
  --sidebar-primary: oklch(0.577 0.245 27.325);
  --sidebar-primary-foreground: oklch(0.971 0.013 17.38);
  --sidebar-accent: oklch(0.96 0.002 17.2);
  --sidebar-accent-foreground: oklch(0.214 0.009 43.1);
  --sidebar-border: oklch(0.922 0.005 34.3);
  --sidebar-ring: oklch(0.714 0.014 41.2);
}

.dark {
  --background: oklch(0.147 0.004 49.3);
  --foreground: oklch(0.986 0.002 67.8);
  --card: oklch(0.214 0.009 43.1);
  --card-foreground: oklch(0.986 0.002 67.8);
  --popover: oklch(0.214 0.009 43.1);
  --popover-foreground: oklch(0.986 0.002 67.8);
  --primary: oklch(0.444 0.177 26.899);
  --primary-foreground: oklch(0.971 0.013 17.38);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.268 0.011 36.5);
  --muted-foreground: oklch(0.714 0.014 41.2);
  --accent: oklch(0.268 0.011 36.5);
  --accent-foreground: oklch(0.986 0.002 67.8);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.547 0.021 43.1);
  --chart-1: oklch(0.868 0.007 39.5);
  --chart-2: oklch(0.547 0.021 43.1);
  --chart-3: oklch(0.438 0.017 39.3);
  --chart-4: oklch(0.367 0.016 35.7);
  --chart-5: oklch(0.268 0.011 36.5);
  --sidebar: oklch(0.214 0.009 43.1);
  --sidebar-foreground: oklch(0.986 0.002 67.8);
  --sidebar-primary: oklch(0.637 0.237 25.331);
  --sidebar-primary-foreground: oklch(0.971 0.013 17.38);
  --sidebar-accent: oklch(0.268 0.011 36.5);
  --sidebar-accent-foreground: oklch(0.986 0.002 67.8);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.547 0.021 43.1);
}`,

  rhea: `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}`,
};

function splitFontFamilies(value: string) {
  const families: string[] = [];
  let current = "";
  let quote: string | null = null;
  let parenDepth = 0;

  for (const char of value) {
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (char === "," && parenDepth === 0) {
      families.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) families.push(current.trim());
  return families;
}

function normalizeFontFamily(value: string) {
  const family = value.trim().replace(/^["']|["']$/g, "");
  if (!family || family.startsWith("var(")) return "";
  const normalized = family.toLowerCase();
  if (GENERIC_FONT_FAMILIES.has(normalized) || SYSTEM_FONT_FAMILIES.has(normalized)) return "";
  return family;
}

function getThemeFontFamilies(css: string) {
  const families = new Set<string>();
  const variablePattern = new RegExp(`--font-(${THEME_FONT_VARIABLES.join("|")})\\s*:\\s*([^;]+);`, "g");
  for (const match of css.matchAll(variablePattern)) {
    const value = match[2];
    const family = splitFontFamilies(value).map(normalizeFontFamily).find(Boolean);
    if (family) families.add(family);
  }
  return [...families];
}

function getThemeFontVariableValues(css: string) {
  const values = new Map<string, string>();
  const variablePattern = new RegExp(`--font-(${APP_FONT_VARIABLES.join("|")})\\s*:\\s*([^;]+);`, "g");
  for (const match of css.matchAll(variablePattern)) {
    const value = match[2].trim();
    if (value.startsWith("var(") || values.has(match[1])) continue;
    values.set(match[1], value);
  }
  return values;
}

function applyThemeFontVariables(css: string) {
  const values = getThemeFontVariableValues(css);
  const root = document.documentElement;
  for (const variable of APP_FONT_VARIABLES) {
    const value = values.get(variable);
    if (value) {
      root.style.setProperty(`--app-font-${variable}`, value);
    } else {
      root.style.removeProperty(`--app-font-${variable}`);
    }
  }
}

function removeThemeFontVariables() {
  const root = document.documentElement;
  for (const variable of APP_FONT_VARIABLES) {
    root.style.removeProperty(`--app-font-${variable}`);
  }
}

function getGoogleFontsUrl(families: string[]) {
  if (families.length === 0) return "";
  const params = families
    .sort((a, b) => a.localeCompare(b))
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, "+")}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

function ensureGoogleFontsPreconnect() {
  if (!document.getElementById(FONT_PRECONNECT_EL_ID)) {
    const link = document.createElement("link");
    link.id = FONT_PRECONNECT_EL_ID;
    link.rel = "preconnect";
    link.href = "https://fonts.googleapis.com";
    document.head.appendChild(link);
  }

  if (!document.getElementById(FONT_PRECONNECT_STATIC_EL_ID)) {
    const link = document.createElement("link");
    link.id = FONT_PRECONNECT_STATIC_EL_ID;
    link.rel = "preconnect";
    link.href = "https://fonts.gstatic.com";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

function removeThemeFontLinks() {
  document.getElementById(FONT_LINK_EL_ID)?.remove();
  document.getElementById(FONT_PRECONNECT_EL_ID)?.remove();
  document.getElementById(FONT_PRECONNECT_STATIC_EL_ID)?.remove();
}

function applyThemeFonts(css: string) {
  const href = getGoogleFontsUrl(getThemeFontFamilies(css));
  const existing = document.getElementById(FONT_LINK_EL_ID) as HTMLLinkElement | null;

  if (!href) {
    removeThemeFontLinks();
    return;
  }

  ensureGoogleFontsPreconnect();

  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }

  const link = document.createElement("link");
  link.id = FONT_LINK_EL_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export function applyThemeStyle(css: string) {
  applyThemeFonts(css);
  applyThemeFontVariables(css);
  let el = document.getElementById(STYLE_EL_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_EL_ID;
    document.head.appendChild(el);
  }
  el.textContent = css.replace(/(^|})\s*\.dark\s*\{/g, "$1\n:root.dark {");
}

export function removeThemeStyle() {
  document.getElementById(STYLE_EL_ID)?.remove();
  removeThemeFontLinks();
  removeThemeFontVariables();
}

export function applySavedThemeStyle() {
  const style = localStorage.getItem(THEME_STYLE_STORAGE_KEY);
  if (!style) return;
  if (style === "custom") {
    const css = localStorage.getItem(THEME_STYLE_CUSTOM_CSS_KEY);
    if (css) applyThemeStyle(css);
  } else {
    const css = THEME_STYLES[style];
    if (css) applyThemeStyle(css);
  }
}

// --- Primary Color ---

export const PRIMARY_COLOR_KEY = "theme-primary-color";
const PRIMARY_STYLE_EL_ID = "theme-primary-override";

const DEFAULT_LIGHT_PRIMARY = "#1456f0";
const DEFAULT_DARK_PRIMARY = "#3b82f6";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return null;
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

function foregroundFor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.55 ? "#000000" : "#ffffff";
}

function darkerHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)));
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)));
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function applyPrimaryColor(color: string) {
  const fg = foregroundFor(color);
  const ring = color;
  const hoverBg = darkerHex(color, 0.15);
  const css = `:root {
  --primary: ${color};
  --primary-foreground: ${fg};
  --ring: ${ring};
  --sidebar-primary: ${color};
  --sidebar-primary-foreground: ${fg};
  --sidebar-ring: ${ring};
  --chart-1: ${color};
}
:root.dark {
  --primary: ${color};
  --primary-foreground: ${fg};
  --ring: ${ring};
  --sidebar-primary: ${color};
  --sidebar-primary-foreground: ${fg};
  --sidebar-ring: ${ring};
  --chart-1: ${color};
}
/* primary button hover */
button.btn-primary-hover:hover, [data-primary-hover]:hover {
  background: ${hoverBg} !important;
}`;
  let el = document.getElementById(PRIMARY_STYLE_EL_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = PRIMARY_STYLE_EL_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function removePrimaryColor() {
  document.getElementById(PRIMARY_STYLE_EL_ID)?.remove();
}

export const DEFAULT_PRIMARY_COLORS = [
  "#1456f0",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
];

export function getDefaultPrimaryColor(): string {
  return DEFAULT_LIGHT_PRIMARY;
}

export function applySavedPrimaryColor() {
  const saved = localStorage.getItem(PRIMARY_COLOR_KEY);
  if (saved) applyPrimaryColor(saved);
}
