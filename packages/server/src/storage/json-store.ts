import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DEFAULT_DATA_DIR = join(process.env.HOME || '~', '.agent-spaces-data');

export function getDataDir(): string {
  return process.env.AGENT_SPACES_DATA_DIR || DEFAULT_DATA_DIR;
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

export function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
