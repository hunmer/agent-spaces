import { getActiveServer } from './server';

const TOKEN_KEY = 'agent-spaces-token';
const VERIFIED_KEY = 'agent-spaces-auth-verified';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored !== null) return stored;
  const serverSecret = getActiveServer()?.secret;
  if (serverSecret !== undefined) return serverSecret;
  return null;
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(VERIFIED_KEY, '1');
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
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

export async function fetchWithAuth(input: string, init?: RequestInit) {
  const headers = { ...authHeaders(), ...init?.headers };
  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 || res.status === 403) {
    removeToken();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  return res;
}
