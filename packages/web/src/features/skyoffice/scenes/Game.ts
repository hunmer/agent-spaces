import * as Phaser from 'phaser'

import { createCharacterAnims } from '../anims/CharacterAnims'

import Item from '../items/Item'
import Chair from '../items/Chair'
import VendingMachine from '../items/VendingMachine'
import '../characters/MyPlayer'
import '../characters/OtherPlayer'
import '../characters/AgentSprite'
import MyPlayer from '../characters/MyPlayer'
import OtherPlayer from '../characters/OtherPlayer'
import AgentSprite from '../characters/AgentSprite'
import PlayerSelector from '../characters/PlayerSelector'
import Network from '../services/Network'
import { IPlayer } from '@agent-spaces/shared/skyoffice'
import { IAgent } from '@agent-spaces/shared/skyoffice'
import { PlayerBehavior } from '@agent-spaces/shared/skyoffice'
import { phaserEvents } from '../events/EventCenter'

import { useChatStore } from '../stores/chat-store'
import { NavKeys, Keyboard } from '../types/KeyboardState'
import { isEditableTarget } from '../utils/dom'
import { findGridPath, tilesCoveredByRect } from '../utils/pathfinding'

/**
 * Game 场景 —— 整合地图、人类玩家、其他玩家、外部 Agent、椅子。
 *
 * 已移除：
 *   - computerMap / handleItemUserAdded(COMPUTER) / handlePlayersOverlap(makeCall)
 *   - WebRTC 触发逻辑
 *   - Whiteboard 相关（whiteboardMap / Whiteboard 层加载 / WHITEBOARD 分支）
 *
 * 新增：
 *   - agentMap: 渲染外部 Agent 推送的角色
 *   - AGENT_JOINED / AGENT_LEFT / AGENT_UPDATED / AGENT_TALK 事件处理
 */
export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: NavKeys
  private keyE!: Phaser.Input.Keyboard.Key
  private keyR!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  private groundLayer!: Phaser.Tilemaps.TilemapLayer
  private furnitureBlockedTiles = new Set<string>()
  private cameraDragStart?: Phaser.Math.Vector2
  private cameraDragLast?: Phaser.Math.Vector2
  private cameraPointerId?: number
  private cameraManuallyPositioned = false
  myPlayer!: MyPlayer
  private playerSelector!: Phaser.GameObjects.Zone
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  /** chairIndex → Chair 实例（用于 zone 标记更新） */
  private chairByIndex = new Map<number, Chair>()
  /** agentId → AgentSprite */
  agentMap = new Map<string, AgentSprite>()
  private nextWanderAt = new Map<string, number>()

  constructor() {
    super('game')
  }

  registerKeys() {
    this.cursors = {
      ...this.input.keyboard.createCursorKeys(),
      ...(this.input.keyboard.addKeys('W,S,A,D') as Keyboard),
    }

    this.keyE = this.input.keyboard.addKey('E')
    this.keyR = this.input.keyboard.addKey('R')
    this.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'W', 'A', 'S', 'D'])
    this.input.keyboard.on('keydown-ENTER', () => {
      // 保留 Enter 触发"事件流面板"的快捷入口（替代原聊天）
      useChatStore.getState().setShowChat(true)
      useChatStore.getState().setFocused(true)
    })
    this.input.keyboard.on('keydown-ESC', () => {
      useChatStore.getState().setShowChat(false)
    })

    let watchingFocus = true
    const syncKeyboardWithFocus = () => {
      queueMicrotask(() => {
        if (!watchingFocus) return
        if (isEditableTarget(document.activeElement)) this.disableKeys()
        else if (!useChatStore.getState().focused) this.enableKeys()
      })
    }
    document.addEventListener('focusin', syncKeyboardWithFocus)
    document.addEventListener('focusout', syncKeyboardWithFocus)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      watchingFocus = false
      document.removeEventListener('focusin', syncKeyboardWithFocus)
      document.removeEventListener('focusout', syncKeyboardWithFocus)
    })
    syncKeyboardWithFocus()
  }

  disableKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return
    keyboard.enabled = false
    keyboard.disableGlobalCapture()
  }

  enableKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return
    keyboard.enabled = true
    keyboard.enableGlobalCapture()
  }

  create(data: { network: Network; autoRegisterKeys?: boolean }) {
    if (!data.network) {
      throw new Error('server instance missing')
    } else {
      this.network = data.network
    }

    createCharacterAnims(this.anims)

    this.map = this.make.tilemap({ key: 'tilemap' })
    const FloorAndGround = this.map.addTilesetImage('FloorAndGround', 'tiles_wall')

    this.groundLayer = this.map.createLayer('Ground', FloorAndGround)
    this.groundLayer.setCollisionByProperty({ collides: true })

    this.myPlayer = this.add.myPlayer(705, 500, 'adam', this.network.mySessionId)
    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)

    // import chair objects from Tiled map to Phaser
    const chairs = this.physics.add.staticGroup({ classType: Chair })
    const chairLayer = this.map.getObjectLayer('Chair')
    chairLayer.objects.forEach((chairObj, i) => {
      const item = this.addObjectFromTiled(chairs, chairObj, 'chairs', 'chair') as Chair
      // custom properties[0] is the object direction specified in Tiled
      item.itemDirection = chairObj.properties[0].value
      item.chairIndex = i
      this.chairByIndex.set(i, item)
    })
    // 异步从服务端拉取 zone 标记并应用到椅子
    this.network.loadChairZones().then((zones) => {
      zones.forEach((z) => {
        const chair = this.chairByIndex.get(z.index)
        if (chair) chair.setZone(z.zone as any)
      })
    }).catch((e) => console.warn('load chair zones failed:', e))

    // import vending machine objects from Tiled map to Phaser
    const vendingMachines = this.physics.add.staticGroup({ classType: VendingMachine })
    const vendingMachineLayer = this.map.getObjectLayer('VendingMachine')
    vendingMachineLayer.objects.forEach((obj) => {
      this.addObjectFromTiled(vendingMachines, obj, 'vendingmachines', 'vendingmachine')
      this.addFurnitureCollision(obj)
    })

    // import other objects from Tiled map to Phaser
    this.addGroupFromTiled('Wall', 'tiles_wall', 'FloorAndGround', false, true)
    this.addGroupFromTiled('Objects', 'office', 'Modern_Office_Black_Shadow', false)
    this.addGroupFromTiled('ObjectsOnCollide', 'office', 'Modern_Office_Black_Shadow', true)
    this.addGroupFromTiled('GenericObjects', 'generic', 'Generic', false)
    this.addGroupFromTiled('GenericObjectsOnCollide', 'generic', 'Generic', true)
    this.addGroupFromTiled('Basement', 'basement', 'Basement', true)

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })

    this.cameras.main.zoom = 1.5
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels)
    this.cameras.main.startFollow(this.myPlayer, true)
    const canvas = this.game.canvas
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      this.cameraPointerId = event.pointerId
      this.cameraDragStart = new Phaser.Math.Vector2(event.clientX, event.clientY)
      this.cameraDragLast = this.cameraDragStart.clone()
      canvas.setPointerCapture(event.pointerId)
    }
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerId !== this.cameraPointerId || !this.cameraDragStart || !this.cameraDragLast) return
      if (Phaser.Math.Distance.Between(this.cameraDragStart.x, this.cameraDragStart.y, event.clientX, event.clientY) > 6) {
        this.cameras.main.stopFollow()
        this.cameraManuallyPositioned = true
        this.cameras.main.scrollX -= (event.clientX - this.cameraDragLast.x) / this.cameras.main.zoom
        this.cameras.main.scrollY -= (event.clientY - this.cameraDragLast.y) / this.cameras.main.zoom
      }
      this.cameraDragLast.set(event.clientX, event.clientY)
    }
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerId !== this.cameraPointerId) return
      this.cameraPointerId = undefined
      this.cameraDragStart = undefined
      this.cameraDragLast = undefined
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const camera = this.cameras.main
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - event.deltaY * 0.001, 0.75, 2.5))
    }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerUp)
    canvas.addEventListener('wheel', wheel, { passive: false })
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerUp)
      canvas.removeEventListener('wheel', wheel)
    })

    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], this.groundLayer)
    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], vendingMachines)

    this.physics.add.overlap(
      this.playerSelector,
      [chairs, vendingMachines],
      this.handleItemSelectorOverlap,
      undefined,
      this
    )

    // 注册网络事件
    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)

    // Agent 相关
    this.network.onAgentJoined(this.handleAgentJoined, this)
    this.network.onAgentLeft(this.handleAgentLeft, this)
    this.network.onAgentUpdated(this.handleAgentUpdated, this)
    this.network.onAgentTalk(this.handleAgentTalk, this)
    this.network.onAgentActivity(this.handleAgentActivity, this)

    // Chair zone 标记更新（来自 ChairZoneMenu 组件写回 map.json 后）
    phaserEvents.on('chair-zone-updated', this.handleChairZoneUpdated, this)

    // 兜底：补 spawn 已存在的 agent / 玩家。
    // 原因：Colyseus state patch 可能在 Game.create() 注册监听器之前到达，
    // 导致 onAdd 事件丢失（Network 把数据写进了 redux，但 Game 场景没收到）。
    // 这里在监听器注册完后扫一遍当前 state，把漏掉的补上。
    this.network.room?.state.agents.forEach((agent, id) => {
      this.handleAgentJoined(agent, id)
    })
    this.network.room?.state.players.forEach((player, id) => {
      if (id === this.network.mySessionId) return
      // 仅当该玩家已有名字时才 spawn（避免渲染未初始化的占位）
      if (player.name) {
        this.handlePlayerJoined(player, id)
      }
    })

    this.time.addEvent({ delay: 1000, loop: true, callback: this.wanderIdleAgents, callbackScope: this })
    if (data.autoRegisterKeys) this.registerKeys()
  }

  private wanderIdleAgents() {
    const now = this.time.now
    this.network.room?.state.agents.forEach((agent, id) => {
      const sprite = this.agentMap.get(id)
      const nextWanderAt = this.nextWanderAt.get(id) ?? now + Phaser.Math.Between(1000, 7000)
      if (!this.nextWanderAt.has(id)) this.nextWanderAt.set(id, nextWanderAt)
      if (now < nextWanderAt || agent.activity !== 'idle' || !sprite || sprite.isMoving()) return
      this.nextWanderAt.set(id, now + Phaser.Math.Between(5000, 12000))

      const start = this.map.worldToTileXY(sprite.x, sprite.y)
      for (let attempt = 0; attempt < 4; attempt++) {
        const targetX = Phaser.Math.Clamp(start.x + Phaser.Math.Between(-3, 3), 0, this.map.width - 1)
        const targetY = Phaser.Math.Clamp(start.y + Phaser.Math.Between(-3, 3), 0, this.map.height - 1)
        if (this.groundLayer.getTileAt(targetX, targetY)?.collides || this.furnitureBlockedTiles.has(`${targetX},${targetY}`)) continue
        const path = findGridPath(
          this.map.width,
          this.map.height,
          start,
          new Phaser.Math.Vector2(targetX, targetY),
          (x, y) => this.groundLayer.getTileAt(x, y)?.collides === true || this.furnitureBlockedTiles.has(`${x},${y}`)
        ).map(({ x, y }) => ({
          x: this.map.tileToWorldX(x) + this.map.tileWidth / 2,
          y: this.map.tileToWorldY(y) + this.map.tileHeight / 2,
        }))
        if (path.length < 2) continue
        sprite.startWalkingPath(
          this.map.tileToWorldX(targetX) + this.map.tileWidth / 2,
          this.map.tileToWorldY(targetY) + this.map.tileHeight / 2,
          'down',
          path,
          false
        )
        break
      }
    })
  }

  private handleItemSelectorOverlap(playerSelector, selectionItem) {
    const currentItem = playerSelector.selectedItem as Item
    if (currentItem) {
      if (currentItem === selectionItem || currentItem.depth >= selectionItem.depth) {
        return
      }
      if (this.myPlayer.playerBehavior !== PlayerBehavior.SITTING) currentItem.clearDialogBox()
    }

    playerSelector.selectedItem = selectionItem
    selectionItem.onOverlapDialog()
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5
    const obj = group
      .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
      .setDepth(actualY)
    return obj
  }

  private addGroupFromTiled(
    objectLayerName: string,
    key: string,
    tilesetName: string,
    collidable: boolean,
    blocksPath = collidable
  ) {
    const group = this.physics.add.staticGroup()
    const objectLayer = this.map.getObjectLayer(objectLayerName)
    objectLayer.objects.forEach((object) => {
      const actualX = object.x! + object.width! * 0.5
      const actualY = object.y! - object.height! * 0.5
      group
        .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
        .setDepth(actualY)
      if (blocksPath) this.addFurnitureCollision(object)
    })
    if (this.myPlayer && collidable)
      this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], group)
  }

  private addFurnitureCollision(object: Phaser.Types.Tilemaps.TiledObject) {
    tilesCoveredByRect(
      object.x!,
      object.y! - object.height!,
      object.width!,
      object.height!,
      this.map.tileWidth,
      this.map.tileHeight
    ).forEach(({ x, y }) => this.furnitureBlockedTiles.add(`${x},${y}`))
  }

  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    const otherPlayer = this.add.otherPlayer(newPlayer.x, newPlayer.y, 'adam', id, newPlayer.name)
    this.otherPlayers.add(otherPlayer)
    this.otherPlayerMap.set(id, otherPlayer)
  }

  private handlePlayerLeft(id: string) {
    if (this.otherPlayerMap.has(id)) {
      const otherPlayer = this.otherPlayerMap.get(id)
      if (!otherPlayer) return
      this.otherPlayers.remove(otherPlayer, true, true)
      this.otherPlayerMap.delete(id)
    }
  }

  private handlePlayerUpdated(field: string, value: number | string, id: string) {
    const otherPlayer = this.otherPlayerMap.get(id)
    otherPlayer?.updateOtherPlayer(field, value)
  }

  private handleChatMessageAdded(playerId: string, content: string) {
    const otherPlayer = this.otherPlayerMap.get(playerId)
    otherPlayer?.updateDialogBubble(content)
  }

  // —— Agent 处理 ——
  private handleAgentJoined(agent: IAgent, id: string) {
    if (this.agentMap.has(id)) {
      // 已存在（state 重传时可能触发），sync 一下
      this.agentMap.get(id)!.syncFromAgent(agent)
      return
    }
    const sprite = this.add.agentSprite(agent)
    this.agentMap.set(id, sprite)
  }

  private handleAgentLeft(id: string) {
    const sprite = this.agentMap.get(id)
    if (sprite) {
      sprite.destroy()
      this.agentMap.delete(id)
    }
    this.nextWanderAt.delete(id)
  }

  private handleAgentUpdated(changes: Array<{ field: string; value: any }>, id: string) {
    const sprite = this.agentMap.get(id)
    if (!sprite) return
    // 如果这批 changes 包含 activity 字段，说明是 activity 切换。
    // 此时 x/y/anim 是服务端写入的目标值（椅子坐标 + sit 动画），
    // 必须跳过它们，否则会瞬移 —— 走路动画由后续的 handleAgentActivity 接管。
    const isActivitySwitch = changes.some((c) => c.field === 'activity')
    changes.forEach((c) => {
      if (isActivitySwitch && (c.field === 'x' || c.field === 'y' || c.field === 'anim')) {
        return // 跳过，交给 handleAgentActivity 处理
      }
      sprite.applyChange(c.field, c.value)
    })
  }

  private handleAgentTalk(agentId: string, text: string) {
    const sprite = this.agentMap.get(agentId)
    sprite?.showTalk(text)
  }

  /**
   * 处理 agent activity 切换：
   * - idle：sprite 原地站立
   * - working/meeting/relaxing：读取服务端分配的 targetX/Y/Dir，tween 走过去坐下
   */
  private handleAgentActivity(agentId: string, agent: IAgent) {
    const sprite = this.agentMap.get(agentId)
    if (!sprite) return
    if (agent.activity === 'idle') {
      sprite.standIdle()
    } else if (agent.targetX && agent.targetY) {
      const start = this.map.worldToTileXY(sprite.x, sprite.y)
      const target = this.map.worldToTileXY(agent.targetX, agent.targetY)
      const path = findGridPath(
        this.map.width,
        this.map.height,
        start,
        target,
        (x, y) => this.groundLayer.getTileAt(x, y)?.collides === true ||
          this.furnitureBlockedTiles.has(`${x},${y}`)
      ).map(({ x, y }) => ({
        x: this.map.tileToWorldX(x) + this.map.tileWidth / 2,
        y: this.map.tileToWorldY(y) + this.map.tileHeight / 2,
      }))
      sprite.startWalkingPath(agent.targetX, agent.targetY, agent.targetDir || 'down', path)
    }
  }

  /** Chair zone 标记被 ChairZoneMenu 更新后，刷新椅子颜色提示 */
  private handleChairZoneUpdated(payload: { chairIndex: number; zone: string }) {
    const chair = this.chairByIndex.get(payload.chairIndex)
    if (chair) {
      chair.setZone(payload.zone as any)
    }
  }

  update(t: number, dt: number) {
    if (this.myPlayer && this.network) {
      if (
        this.cameraPointerId === undefined &&
        this.cameraManuallyPositioned &&
        this.myPlayer.body!.velocity.lengthSq() > 0 &&
        !this.cameras.main.worldView.contains(this.myPlayer.x, this.myPlayer.y)
      ) {
        this.cameraManuallyPositioned = false
        this.cameras.main.startFollow(this.myPlayer, true)
      }
      this.playerSelector.update(this.myPlayer, this.cursors)
      this.myPlayer.update(this.playerSelector, this.cursors, this.keyE, this.keyR, this.network)
    }
  }
}
