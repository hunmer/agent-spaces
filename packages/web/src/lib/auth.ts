import { getActiveServer, getActiveServerUrl, loadActiveId } from './server';
import { toStaticHref } from './navigate';
import { isLoginPath } from './routes';

const TOKEN_KEY = 'agent-spaces-token';
const VERIFIED_KEY = 'agent-spaces-auth-verified';

function getTokenKey(): string {
  return `${TOKEN_KEY}:${loadActiveId()}`;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(getTokenKey());
  if (stored !== null) return stored;
  // fallback to server config secret
  const serverSecret = getActiveServer()?.secret;
  if (serverSecret !== undefined) return serverSecret;
  return null;
}

export function setToken(token: string) {
  localStorage.setItem(getTokenKey(), token);
  localStorage.setItem(VERIFIED_KEY, '1');
  localStorage.removeItem(TOKEN_KEY); // cleanup legacy global token
}

export function removeToken() {
  localStorage.removeItem(getTokenKey());
  localStorage.removeItem(VERIFIED_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(VERIFIED_KEY) === '1';
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  if (token === null) return {};
  return { Authorization: `Bearer ${token}` };
}

function resolveUrl(input: string): string {
  if (typeof input !== 'string' || input.startsWith('http')) return input;
  const baseUrl = getActiveServerUrl();
  if (!baseUrl) return input;
  return `${baseUrl}${input.startsWith('/') ? '' : '/'}${input}`;
}

export async function fetchWithAuth(input: string, init?: RequestInit) {
  const url = resolveUrl(input);
  const headers = { ...authHeaders(), ...init?.headers };
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 || res.status === 403) {
    removeToken();
    if (typeof window !== 'undefined' && !isLoginPath(window.location.pathname)) {
      window.location.replace(toStaticHref('/login'));
    }
  }

  return res;
}
