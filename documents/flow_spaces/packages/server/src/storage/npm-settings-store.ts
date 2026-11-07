import { join } from 'node:path';
import { getDataDir, readJsonFile, writeJsonFile } from './json-store.js';

export interface NpmSettings {
  registry: string;
  proxy?: string;
}

export const DEFAULT_NPM_REGISTRY = 'https://registry.npmmirror.com';

const FILE = () => join(getDataDir(), 'npm-settings.json');

export function getNpmSettings(): NpmSettings {
  const settings = readJsonFile<Partial<NpmSettings>>(FILE()) ?? {};
  return {
    registry: typeof settings.registry === 'string' && settings.registry.trim()
      ? settings.registry.trim()
      : DEFAULT_NPM_REGISTRY,
    proxy: typeof settings.proxy === 'string' ? settings.proxy.trim() : '',
  };
}

export function saveNpmSettings(input: Partial<NpmSettings>): NpmSettings {
  const settings: NpmSettings = {
    registry: typeof input.registry === 'string' && input.registry.trim()
      ? input.registry.trim()
      : DEFAULT_NPM_REGISTRY,
    proxy: typeof input.proxy === 'string' ? input.proxy.trim() : '',
  };
  writeJsonFile(FILE(), settings);
  return settings;
}
