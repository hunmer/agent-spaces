import * as Phaser from 'phaser'

/**
 * Phaser 场景与 React 组件之间的事件总线（单例）。
 * 保留 Phaser.Events.EventEmitter，因为 skyoffice 整个事件桥都基于它，
 * 且 phaser 已是依赖。场景内部 emit，React 组件 on 订阅（或反向）。
 */
export const phaserEvents = new Phaser.Events.EventEmitter()

export enum Event {
  PLAYER_JOINED = 'player-joined',
  PLAYER_UPDATED = 'player-updated',
  PLAYER_LEFT = 'player-left',
  MY_PLAYER_NAME_CHANGE = 'my-player-name-change',
  MY_PLAYER_TEXTURE_CHANGE = 'my-player-texture-change',
  ITEM_USER_ADDED = 'item-user-added',
  ITEM_USER_REMOVED = 'item-user-removed',
  UPDATE_DIALOG_BUBBLE = 'update-dialog-bubble',
  AGENT_JOINED = 'agent-joined',
  AGENT_LEFT = 'agent-left',
  AGENT_UPDATED = 'agent-updated',
  AGENT_TALK = 'agent-talk',
  AGENT_EVENT = 'agent-event',
  AGENT_ACTIVITY = 'agent-activity',
}
