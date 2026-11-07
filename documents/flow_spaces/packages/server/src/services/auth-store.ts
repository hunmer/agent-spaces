import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getDataDir } from '../storage/json-store.js';

const AUTH_FILE = () => join(getDataDir(), 'auth.json');

export function getSecret(): string {
  try {
    const raw = readFileSync(AUTH_FILE(), 'utf-8');
    const data = JSON.parse(raw);
    return typeof data.secret === 'string' ? data.secret : '';
  } catch {
    return '';
  }
}

export function setSecret(secret: string): void {
  const file = AUTH_FILE();
  const dir = join(file, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ secret }, null, 2), 'utf-8');
}
