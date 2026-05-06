'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import zh from '@/locales/zh.json';

const STORAGE_KEY = 'agent-spaces-locale';
const DEFAULT_LOCALE = 'zh' as const;

const messagesMap = { en, zh } as const;
export type Locale = keyof typeof messagesMap;

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function useLocale() {
  return useContext(LocaleContext);
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'zh') return saved;
  return DEFAULT_LOCALE;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  useServerInsertedHTML(() => (
    <script
      key="locale-init"
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var l=localStorage.getItem('${STORAGE_KEY}');document.documentElement.lang=(l==='en')?'en':'zh-CN'}catch(e){}})()`,
      }}
    />
  ));

  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((newLocale: Locale) => {
    localStorage.setItem(STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale === 'zh' ? 'zh-CN' : 'en';
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={messagesMap[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
