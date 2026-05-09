import { getActiveServerUrl } from './server';

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  const key = '__api_patched__';

  if (!(window as any)[key]) {
    (window as any)[key] = true;

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        const baseUrl = getActiveServerUrl();
        if (baseUrl) {
          input = `${baseUrl}${input}`;
        }
      }
      return originalFetch.call(window, input, init);
    };
  }
}
