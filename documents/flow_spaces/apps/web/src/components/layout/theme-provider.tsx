'use client'

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { useServerInsertedHTML } from "next/navigation";

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolvedTheme: 'light',
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = 'agent-spaces-theme';
const FONT_STORAGE_KEY = 'customFont';
const CUSTOM_FONTS_KEY = 'customFonts';
const THEME_COLORS = {
  light: '#ffffff',
  dark: '#0f1117',
} as const;

declare global {
  interface Window {
    AgentSpacesStatusBar?: {
      setTheme: (theme: 'light' | 'dark') => void;
      getTopInset?: () => number;
    };
  }
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  applyNativeTheme(resolved);
}

function applyNativeTheme(resolved: 'light' | 'dark') {
  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    document.head.appendChild(themeColor);
  }
  themeColor.content = THEME_COLORS[resolved];
  window.AgentSpacesStatusBar?.setTheme(resolved);
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}) {
  // Inject theme script during SSR only — prevents FOUC without triggering React 19 warning
  useServerInsertedHTML(() => (
    <script
      key="theme-init"
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme:dark)').matches);var r=d?'dark':'light';document.documentElement.classList.add(r);document.documentElement.style.colorScheme=r;var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.appendChild(m)}m.content=d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}';if(window.AgentSpacesStatusBar){window.AgentSpacesStatusBar.setTheme(r)}var f=localStorage.getItem('${FONT_STORAGE_KEY}');document.documentElement.dataset.customFont=f?'true':'false';if(f){var ff=f;try{var c=JSON.parse(localStorage.getItem('${CUSTOM_FONTS_KEY}')||'[]');var cf=Array.isArray(c)&&c.find(function(x){return x&&x.name===f});if(cf&&cf.url){ff=f.replace(/\\.\\w+$/,'');var id='font-'+f.replace(/[^a-zA-Z0-9]/g,'-');if(!document.getElementById(id)){var s=document.createElement('style');s.id=id;s.textContent='@font-face { font-family: "'+ff.replace(/"/g,'\\\\22 ')+'"; src: url("'+String(cf.url).replace(/"/g,'\\\\22 ')+'"); }';document.head.appendChild(s)}}}catch(e){}var v=ff==='system-ui'||ff==='monospace'?ff:'"'+ff.replace(/"/g,'\\\\22 ')+'"';['--font-app','--font-sans','--font-heading','--font-mid','--font-mono'].forEach(function(k){document.documentElement.style.setProperty(k,v)})}}catch(e){}})()`,
      }}
    />
  ));

  const systemTheme = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => getSystemTheme(),
    () => 'light' as const,
  );

  const storedTheme = useSyncExternalStore(
    (cb) => {
      window.addEventListener('storage', cb);
      return () => window.removeEventListener('storage', cb);
    },
    () => (localStorage.getItem(STORAGE_KEY) as Theme) || (defaultTheme as Theme),
    () => defaultTheme as Theme,
  );

  const theme = storedTheme;
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, systemTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
