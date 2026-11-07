import type { Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';
import type { BotAdapter, BroadcastEnvelope, WeChatMessage } from './types.js';
import {
  WECHAT_BASE_URL,
  WECHAT_BACKOFF_DELAY_MS,
  WECHAT_MAX_CONSECUTIVE_FAILURES,
  WECHAT_RETRY_DELAY_MS,
  WeChatMessageType,
  wechatUserIdsByWorkspace,
} from './types.js';
import { formatLarkTitle, formatLarkContent } from './format.js';
import { persistWeChatUserIds, persistWeChatGetUpdatesBuf, sleep } from './helpers.js';
import {
  getWeChatUpdates,
  sendWeChatTextMessage,
  extractWeChatTextFromMessage,
  isDuplicateWeChatMessage,
  getWeChatContextToken,
  setWeChatContextToken,
} from './wechat-api.js';
import { isBuiltInCommand, buildCommandResponse } from './bot-commands.js';
import { getConfiguredBotAgent, runBotAgent } from './bot-agent.js';

export class WeChatNotificationAdapter implements BotAdapter {
  private running = false;
  private credentials: import('./types.js').WeChatCredentials;
  private getUpdatesBuf = '';

  constructor(
    private workspace: Workspace,
    settings: WorkspaceNotificationSettings,
  ) {
    const token = settings.wechat?.token?.trim();
    const baseUrl = settings.wechat?.baseUrl?.trim() || WECHAT_BASE_URL;
    const accountId = settings.wechat?.accountId?.trim();
    if (!token || !accountId) {
      throw new Error('WeChat login is required. Scan the QR code first.');
    }
    this.credentials = {
      token,
      baseUrl,
      accountId,
      userId: settings.wechat?.userId,
    };
    this.getUpdatesBuf = settings.wechat?.getUpdatesBuf ?? '';
    if (settings.wechat?.userIds?.length) {
      wechatUserIdsByWorkspace.set(workspace.id, new Set(settings.wechat.userIds));
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(envelope: BroadcastEnvelope): Promise<void> {
    const userIds = wechatUserIdsByWorkspace.get(this.workspace.id);
    if (!userIds?.size) return;

    const text = [
      formatLarkTitle(envelope),
      '',
      formatLarkContent(envelope),
    ].filter(Boolean).join('\n');

    for (const userId of userIds) {
      await sendWeChatTextMessage(
        this.credentials.baseUrl,
        this.credentials.token,
        userId,
        text,
        getWeChatContextToken(this.workspace.id, userId),
      );
    }
  }

  hasRecipients(): boolean {
    return Boolean(wechatUserIdsByWorkspace.get(this.workspace.id)?.size);
  }

  private async pollLoop(): Promise<void> {
    let failures = 0;
    while (this.running) {
      try {
        const resp = await getWeChatUpdates(
          this.credentials.baseUrl,
          this.credentials.token,
          this.getUpdatesBuf,
        );

        if (resp.ret !== undefined && resp.ret !== 0) {
          failures++;
          console.error(`[notification] WeChat getupdates failed workspaceId=${this.workspace.id} ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg}`);
          await sleep(failures >= WECHAT_MAX_CONSECUTIVE_FAILURES ? WECHAT_BACKOFF_DELAY_MS : WECHAT_RETRY_DELAY_MS);
          if (failures >= WECHAT_MAX_CONSECUTIVE_FAILURES) failures = 0;
          continue;
        }

        failures = 0;
        if (resp.get_updates_buf && resp.get_updates_buf !== this.getUpdatesBuf) {
          this.getUpdatesBuf = resp.get_updates_buf;
          persistWeChatGetUpdatesBuf(this.workspace.id, this.getUpdatesBuf);
        }

        for (const msg of resp.msgs ?? []) {
          await this.handleMessage(msg);
        }
      } catch (err) {
        failures++;
        console.error(`[notification] WeChat polling error workspaceId=${this.workspace.id}:`, err);
        await sleep(failures >= WECHAT_MAX_CONSECUTIVE_FAILURES ? WECHAT_BACKOFF_DELAY_MS : WECHAT_RETRY_DELAY_MS);
        if (failures >= WECHAT_MAX_CONSECUTIVE_FAILURES) failures = 0;
      }
    }
  }

  private async handleMessage(msg: WeChatMessage): Promise<void> {
    if (msg.message_type !== WeChatMessageType.USER) return;
    if (isDuplicateWeChatMessage(this.workspace.id, msg)) return;

    const fromUser = msg.from_user_id;
    if (!fromUser) return;

    const userIds = wechatUserIdsByWorkspace.get(this.workspace.id) ?? new Set<string>();
    userIds.add(fromUser);
    wechatUserIdsByWorkspace.set(this.workspace.id, userIds);
    persistWeChatUserIds(this.workspace.id, Array.from(userIds));

    if (msg.context_token) {
      setWeChatContextToken(this.workspace.id, fromUser, msg.context_token);
    }

    const text = extractWeChatTextFromMessage(msg).trim();
    if (!text) return;
    if (isBuiltInCommand(text)) {
      await this.reply(fromUser, await buildCommandResponse({
        defaultWorkspaceId: this.workspace.id,
        conversationId: `wechat:${fromUser}`,
        text,
      }));
      return;
    }

    const botAgent = getConfiguredBotAgent(this.workspace.id);
    if (!botAgent) {
      await this.reply(fromUser, '请先设置agent');
      return;
    }

    await this.reply(fromUser, `${botAgent.name} working...`);
    const reply = await runBotAgent(this.workspace.id, botAgent, text);
    await this.reply(fromUser, reply);
  }

  private async reply(to: string, text: string): Promise<void> {
    await sendWeChatTextMessage(
      this.credentials.baseUrl,
      this.credentials.token,
      to,
      text,
      getWeChatContextToken(this.workspace.id, to),
    );
  }
}
