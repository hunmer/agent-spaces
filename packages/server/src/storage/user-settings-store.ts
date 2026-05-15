import { join } from 'node:path';
import { readJsonFile, writeJsonFile, getDataDir } from './json-store.js';

interface UserSettings {
  avatarUrl?: string;
}

const FILE = () => join(getDataDir(), 'user-settings.json');

export function getUserSettings(): UserSettings {
  return readJsonFile<UserSettings>(FILE()) ?? {};
}

export function setUserAvatarUrl(url: string): void {
  const settings = getUserSettings();
  settings.avatarUrl = url;
  writeJsonFile(FILE(), settings);
}

export function removeUserAvatarUrl(): void {
  const settings = getUserSettings();
  delete settings.avatarUrl;
  writeJsonFile(FILE(), settings);
}
