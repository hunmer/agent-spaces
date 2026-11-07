import { join } from 'node:path';
import { readJsonFile, writeJsonFile, getDataDir } from './json-store.js';
import type { RobotAccount } from '@agent-spaces/shared';

const FILE = () => join(getDataDir(), 'robot-accounts.json');

type Store = { accounts: RobotAccount[] };

function read(): Store {
  return readJsonFile<Store>(FILE()) ?? { accounts: [] };
}

function write(data: Store): void {
  writeJsonFile(FILE(), data);
}

export function listRobotAccounts(): RobotAccount[] {
  return read().accounts;
}

export function getRobotAccount(id: string): RobotAccount | undefined {
  return read().accounts.find((a) => a.id === id);
}

export function createRobotAccount(account: RobotAccount): void {
  const data = read();
  data.accounts.push(account);
  write(data);
}

export function updateRobotAccount(id: string, patch: Partial<RobotAccount>): RobotAccount | null {
  const data = read();
  const idx = data.accounts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  data.accounts[idx] = { ...data.accounts[idx], ...patch, id, updatedAt: new Date().toISOString() };
  write(data);
  return data.accounts[idx];
}

export function deleteRobotAccount(id: string): boolean {
  const data = read();
  const before = data.accounts.length;
  data.accounts = data.accounts.filter((a) => a.id !== id);
  if (data.accounts.length === before) return false;
  write(data);
  return true;
}
