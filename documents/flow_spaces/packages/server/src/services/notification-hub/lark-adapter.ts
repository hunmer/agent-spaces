import * as Lark from '@larksuiteoapi/node-sdk';
import type { Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';
import type { BotAdapter, BroadcastEnvelope, LarkMessageReceiveEvent } from './types.js';
import { larkChatIdsByWorkspace } from './types.js';
import { formatLarkTitle, formatLarkContent } from './format.js';
import { persistLarkChatIds } from './helpers.js';
import { isDuplicateLarkMessage, parseLarkText } from './lark-api.js';
import { isBuiltInCommand, buildCommandResponse } from './bot-commands.js';
import { getConfiguredBotAgent, runBotAgent } from './bot-agent.js';

export class LarkNotificationAdapter implements BotAdapter {
  private client: Lark.Client;
  private wsClient: Lark.WSClient;
  private started = false;

  constructor(
    private workspace: Workspace,
    settings: WorkspaceNotificationSettings,
  ) {
    const appId = settings.lark?.appId?.trim();
    const appSecret = settings.lark?.appSecret?.trim();
    if (!appId || !appSecret) {
      throw new Error('Lark app_id and app_secret are required');
    }
    const baseConfig = { appId, appSecret };
    this.client = new Lark.Client(baseConfig);
    this.wsClient = new Lark.WSClient({ ...baseConfig, loggerLevel: Lark.LoggerLevel.info });
    if (settings.lark?.chatIds?.length) {
      larkChatIdsByWorkspace.set(workspace.id, new Set(settings.lark.chatIds));
    }
  }

  async start(): Promise<void> {
    this.wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => this.handleMessage(data),
      }),
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.wsClient.close({ force: true });
  }

  async send(envelope: BroadcastEnvelope): Promise<void> {
    const chatIds = larkChatIdsByWorkspace.get(this.workspace.id);
    if (!chatIds?.size) return;

    for (const chatId of chatIds) {
      await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          content: Lark.messageCard.defaultCard({
            title: formatLarkTitle(envelope),
            content: formatLarkContent(envelope),
          }),
          msg_type: 'interactive',
        },
      });
    }
  }

  hasRecipients(): boolean {
    return Boolean(larkChatIdsByWorkspace.get(this.workspace.id)?.size);
  }

  private async handleMessage(data: LarkMessageReceiveEvent): Promise<void> {
    const chatId = data.message?.chat_id;
    if (!chatId) return;
    if (isDuplicateLarkMessage(this.workspace.id, data)) return;
    if (data.sender?.sender_type && data.sender.sender_type !== 'user') return;
    if (data.message?.message_type && data.message.message_type !== 'text') return;

    const chatIds = larkChatIdsByWorkspace.get(this.workspace.id) ?? new Set<string>();
    chatIds.add(chatId);
    larkChatIdsByWorkspace.set(this.workspace.id, chatIds);
    persistLarkChatIds(this.workspace.id, Array.from(chatIds));

    const text = parseLarkText(data.message?.content);
    if (!text) return;
    if (isBuiltInCommand(text)) {
      await this.sendCard(chatId, 'Agent Spaces', await buildCommandResponse({
        defaultWorkspaceId: this.workspace.id,
        conversationId: `lark:${chatId}`,
        text,
      }));
      return;
    }

    const botAgent = getConfiguredBotAgent(this.workspace.id);
    if (!botAgent) {
      await this.sendCard(chatId, 'Agent Spaces', '请先设置agent');
      return;
    }

    await this.sendCard(chatId, 'Agent Spaces', `${botAgent.name} working...`);
    const reply = await runBotAgent(this.workspace.id, botAgent, text);
    await this.sendCard(chatId, botAgent.name, reply);
  }

  private async sendCard(chatId: string, title: string, content: string): Promise<void> {
    await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: Lark.messageCard.defaultCard({
          title,
          content,
        }),
        msg_type: 'interactive',
      },
    });
  }
}
