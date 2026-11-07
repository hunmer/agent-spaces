import { v4 as uuid } from 'uuid';
import { listRobotAccounts, getRobotAccount, createRobotAccount, updateRobotAccount, deleteRobotAccount } from '../storage/robot-account-store.js';
import type { RobotAccount, WorkspaceNotificationSettings } from '@agent-spaces/shared';

export { listRobotAccounts, getRobotAccount, deleteRobotAccount };

export function createAccount(input: { name: string; type: 'lark' | 'wechat'; lark?: { appId: string; appSecret: string }; wechat?: { token: string; baseUrl?: string; accountId: string; userId?: string } }): RobotAccount {
  const now = new Date().toISOString();
  const account: RobotAccount = { id: uuid(), name: input.name, type: input.type, lark: input.lark, wechat: input.wechat, createdAt: now, updatedAt: now };
  createRobotAccount(account);
  return account;
}

export function updateAccount(id: string, patch: Partial<Pick<RobotAccount, 'name' | 'lark' | 'wechat'>>): RobotAccount | null {
  return updateRobotAccount(id, patch);
}

export type ResolvedCredentials = { type: 'lark'; appId: string; appSecret: string } | { type: 'wechat'; token: string; baseUrl: string; accountId: string; userId?: string } | null;

export function resolveCredentials(settings: WorkspaceNotificationSettings): ResolvedCredentials {
  if (settings.robotAccountId) {
    const account = getRobotAccount(settings.robotAccountId);
    if (account) {
      if (account.type === 'lark' && account.lark) {
        return { type: 'lark', appId: account.lark.appId, appSecret: account.lark.appSecret };
      }
      if (account.type === 'wechat' && account.wechat) {
        return { type: 'wechat', token: account.wechat.token, baseUrl: account.wechat.baseUrl || 'https://qyapi.weixin.qq.com', accountId: account.wechat.accountId, userId: account.wechat.userId };
      }
    }
  }

  // fallback to inline credentials
  if (settings.provider === 'lark' && settings.lark?.appId && settings.lark?.appSecret) {
    return { type: 'lark', appId: settings.lark.appId, appSecret: settings.lark.appSecret };
  }
  if (settings.provider === 'wechat' && settings.wechat?.token && settings.wechat?.accountId) {
    return { type: 'wechat', token: settings.wechat.token, baseUrl: settings.wechat.baseUrl || 'https://qyapi.weixin.qq.com', accountId: settings.wechat.accountId, userId: settings.wechat.userId };
  }

  return null;
}
