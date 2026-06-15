"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/layout/theme-provider";
import { cn } from "@/lib/utils";
import { Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/ui/search-select";
import { sdk } from "@/lib/sdk";
import {
  THEME_STYLE_STORAGE_KEY as STYLE_STORAGE_KEY,
  THEME_STYLE_CUSTOM_CSS_KEY as STYLE_CUSTOM_CSS_KEY,
  THEME_STYLES,
  PRIMARY_COLOR_KEY,
  DEFAULT_PRIMARY_COLORS,
  applyThemeStyle,
  removeThemeStyle,
  applyPrimaryColor,
  removePrimaryColor,
  getDefaultPrimaryColor,
} from "@/lib/theme-style";
import { ColorPicker } from "@/components/ui/color-picker";
import { CustomFontDialog } from "./custom-font-dialog";

const BUILTIN_FONTS = [
  { value: "", label: "Default" },
  { value: "DM Sans", label: "DM Sans" },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "system-ui", label: "System UI" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Courier New", label: "Courier New" },
  { value: "Menlo", label: "Menlo" },
  { value: "monospace", label: "Monospace" },
];

const STORAGE_KEY = "customFont";
const CUSTOM_FONTS_KEY = "customFonts";
const FONT_VARIABLES = [
  "--font-app",
  "--font-sans",
  "--font-heading",
  "--font-mid",
  "--font-mono",
  "--app-font-sans",
  "--app-font-serif",
  "--app-font-heading",
  "--app-font-mid",
  "--app-font-mono",
];

interface CustomFont {
  name: string;
  url: string;
}

function getFontFamily(value: string, customFonts: CustomFont[]) {
  const builtin = BUILTIN_FONTS.find(f => f.value === value);
  if (builtin) return value;
  const custom = customFonts.find(f => f.name === value);
  if (custom) return `"${getCustomFontFamilyName(value)}"`;
  return value;
}

function applyFont(value: string, customFonts: CustomFont[]) {
  const root = document.documentElement;
  root.dataset.customFont = value ? "true" : "false";

  if (!value) {
    for (const variable of FONT_VARIABLES) {
      root.style.removeProperty(variable);
    }
    return;
  }

  const family = getFontFamily(value, customFonts);
  for (const variable of FONT_VARIABLES) {
    root.style.setProperty(variable, family);
  }
}

function getCustomFontFamilyName(name: string) {
  return name.replace(/\.\w+$/, '');
}

function loadFontFace(name: string, url: string) {
  const id = `font-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
  if (document.getElementById(id)) return;
  const fontName = getCustomFontFamilyName(name);
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `@font-face { font-family: "${fontName}"; src: url("${url}"); }`;
  document.head.appendChild(style);
}

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("settings");

  const [font, setFont] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_KEY) || "";
  });
  const [customFonts, setCustomFonts] = useState<CustomFont[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_FONTS_KEY) || "[]");
    } catch { return []; }
  });
  const [fontDialogOpen, setFontDialogOpen] = useState(false);
  const [themeStyle, setThemeStyle] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STYLE_STORAGE_KEY) || "";
  });
  const [primaryColor, setPrimaryColor] = useState(() => {
    if (typeof window === "undefined") return getDefaultPrimaryColor();
    return localStorage.getItem(PRIMARY_COLOR_KEY) || getDefaultPrimaryColor();
  });
  const [customCss, setCustomCss] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STYLE_CUSTOM_CSS_KEY) || "";
  });

  const themeOptions = [
    { value: "light" as const, label: t("themeLight") },
    { value: "dark" as const, label: t("themeDark") },
    { value: "system" as const, label: t("themeSystem") },
  ];

  // Load custom font faces on mount
  useEffect(() => {
    for (const cf of customFonts) {
      loadFontFace(cf.name, cf.url);
    }
    applyFont(font, customFonts);
  }, [customFonts, font]);

  // Apply saved theme style on mount
  useEffect(() => {
    if (!themeStyle) return;
    if (themeStyle === "custom") {
      if (customCss) applyThemeStyle(customCss);
    } else {
      const css = THEME_STYLES[themeStyle];
      if (css) applyThemeStyle(css);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleThemeStyleChange = useCallback((value: string) => {
    setThemeStyle(value);
    localStorage.setItem(STYLE_STORAGE_KEY, value);
    if (value === "custom") {
      if (customCss) applyThemeStyle(customCss);
    } else if (value === "") {
      removeThemeStyle();
    } else {
      const css = THEME_STYLES[value];
      if (css) applyThemeStyle(css);
    }
  }, [customCss]);

  const handleCustomCssChange = useCallback((value: string) => {
    setCustomCss(value);
    localStorage.setItem(STYLE_CUSTOM_CSS_KEY, value);
    applyThemeStyle(value);
  }, []);

  const handlePrimaryColorChange = useCallback((color: string) => {
    setPrimaryColor(color);
    if (color) {
      localStorage.setItem(PRIMARY_COLOR_KEY, color);
      applyPrimaryColor(color);
    } else {
      localStorage.removeItem(PRIMARY_COLOR_KEY);
      removePrimaryColor();
    }
  }, []);

  const handleFontChange = useCallback((value: string) => {
    setFont(value);
    localStorage.setItem(STORAGE_KEY, value);
    applyFont(value, customFonts);
  }, [customFonts]);

  const handleFontAdded = useCallback(async (url: string, name: string) => {
    const newFont = { name, url };
    const updated = [...customFonts, newFont];
    setCustomFonts(updated);
    localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(updated));
    loadFontFace(name, url);
    // Auto-select the newly added font
    setFont(name);
    localStorage.setItem(STORAGE_KEY, name);
    // Small delay for font to load before applying
    setTimeout(() => applyFont(name, updated), 100);
  }, [customFonts]);

  // Fetch server-side fonts and merge
  useEffect(() => {
    sdk.font.list()
      .then((serverFonts) => {
        if (serverFonts.length === 0) return;
        setCustomFonts(prev => {
          const existing = new Set(prev.map(f => f.name));
          const merged = [...prev];
          for (const sf of serverFonts) {
            if (!existing.has(sf.name)) merged.push(sf);
          }
          localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(merged));
          return merged;
        });
        for (const sf of serverFonts) loadFontFace(sf.name, sf.url);
      })
      .catch(() => {});
  }, []);

  const fontOptions = [
    ...BUILTIN_FONTS,
    ...customFonts.map(f => ({ value: f.name, label: f.name.replace(/\.\w+$/, '') })),
  ];

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          {t("theme")}
        </label>
        <div className="flex gap-3">
          {themeOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span
                className={cn(
                  "relative block h-[70px] w-[88px] overflow-hidden rounded-lg shadow-xs transition-shadow",
                  "ring-2 ring-offset-1 ring-offset-background",
                  theme === value ? "ring-primary/48 opacity-100" : "ring-transparent opacity-80 hover:opacity-100",
                )}
              >
                {themePreviews[value]}
              </span>
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  theme === value ? "text-foreground" : "text-muted-foreground/70 group-hover:text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          {t("primaryColor") || "Primary Color"}
        </label>
        <ColorPicker
          colors={DEFAULT_PRIMARY_COLORS}
          value={primaryColor}
          onChange={handlePrimaryColorChange}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          Style
        </label>
        <SearchSelect
          value={themeStyle}
          onChange={handleThemeStyleChange}
          options={[
            { value: "", label: "Default" },
            { value: "mira", label: "Mira" },
            { value: "lyra", label: "Lyra" },
            { value: "luma", label: "Luma" },
            { value: "rhea", label: "Rhea" },
            { value: "custom", label: "Custom" },
          ]}
          placeholder="Select style..."
          allowCustom={false}
        />
        {themeStyle === "custom" && (
          <>
            <Textarea
              className="mt-2 font-mono text-xs min-h-40"
              placeholder="Paste CSS variables here..."
              value={customCss}
              onChange={(e) => handleCustomCssChange(e.target.value)}
            />
            <Button
              variant="link"
              size="sm"
              className="mt-1.5 h-auto p-0 text-xs"
              onClick={() => window.open("https://tweakcn.com/", "_blank")}
            >
              <ExternalLink className="size-3 mr-1" />
              tweakcn.com
            </Button>
          </>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          {t("font")}
        </label>
        <div className="flex items-center gap-2">
          <SearchSelect
            value={font}
            onChange={handleFontChange}
            options={fontOptions}
            placeholder={t("fontPlaceholder")}
            searchPlaceholder={t("fontSearch")}
            allowCustom={false}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setFontDialogOpen(true)}
            title={t("addCustomFont")}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <CustomFontDialog
        open={fontDialogOpen}
        onOpenChange={setFontDialogOpen}
        onFontAdded={handleFontAdded}
      />
    </div>
  );
}

const themePreviews: Record<string, React.ReactNode> = {
  light: (
    <svg aria-hidden className="size-full" fill="none" viewBox="0 0 88 70" xmlns="http://www.w3.org/2000/svg">
      <path className="fill-neutral-200" d="M0 0h88v70H0z" />
      <path className="fill-white shadow-sm" d="M10 12a4 4 0 0 1 4-4h74v62H10V12Z" />
      <circle className="fill-neutral-300" cx="28" cy="26" r="8" />
      <rect className="fill-neutral-200" height="4" rx="2" width="58" x="20" y="42" />
      <rect className="fill-neutral-200" height="4" rx="2" width="58" x="20" y="49" />
      <rect className="fill-neutral-200" height="4" rx="2" width="29" x="20" y="56" />
    </svg>
  ),
  dark: (
    <svg aria-hidden className="size-full" fill="none" viewBox="0 0 88 70" xmlns="http://www.w3.org/2000/svg">
      <path className="fill-neutral-900" d="M0 0h88v70H0z" />
      <path className="fill-neutral-800 shadow-sm" d="M10 12a4 4 0 0 1 4-4h74v62H10V12Z" />
      <circle className="fill-neutral-600" cx="28" cy="26" r="8" />
      <rect className="fill-neutral-700" height="4" rx="2" width="58" x="20" y="42" />
      <rect className="fill-neutral-700" height="4" rx="2" width="58" x="20" y="49" />
      <rect className="fill-neutral-700" height="4" rx="2" width="29" x="20" y="56" />
    </svg>
  ),
  system: (
    <svg aria-hidden className="size-full" fill="none" viewBox="0 0 88 70" xmlns="http://www.w3.org/2000/svg">
      <path className="fill-neutral-200" d="M0 0h44v70H0z" />
      <path className="fill-neutral-900" d="M44 0h44v70H44z" />
      <path className="fill-white shadow-sm" d="M10 12a4 4 0 0 1 4-4h30v62H10V12Z" />
      <circle className="fill-neutral-300" cx="28" cy="26" r="8" />
      <path className="fill-neutral-200" d="M20 44a2 2 0 0 1 2-2h22v4H22a2 2 0 0 1-2-2ZM20 51a2 2 0 0 1 2-2h22v4H22a2 2 0 0 1-2-2ZM20 58a2 2 0 0 1 2-2h22v4H22a2 2 0 0 1-2-2Z" />
      <path className="fill-neutral-800 shadow-sm" d="M54 12a4 4 0 0 1 4-4h30v62H54V12Z" />
      <circle className="fill-neutral-600" cx="72" cy="26" r="8" />
      <path className="fill-neutral-700" d="M64 44a2 2 0 0 1 2-2h22v4H66a2 2 0 0 1-2-2ZM64 51a2 2 0 0 1 2-2h22v4H66a2 2 0 0 1-2-2ZM64 58a2 2 0 0 1 2-2h22v4H66a2 2 0 0 1-2-2Z" />
    </svg>
  ),
};
