import Phaser from 'phaser'

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
  // Agent 相关（外部广播 WS 推送）
  AGENT_JOINED = 'agent-joined',
  AGENT_LEFT = 'agent-left',
  AGENT_UPDATED = 'agent-updated',
  AGENT_TALK = 'agent-talk',
  AGENT_EVENT = 'agent-event',
  AGENT_ACTIVITY = 'agent-activity',
}
