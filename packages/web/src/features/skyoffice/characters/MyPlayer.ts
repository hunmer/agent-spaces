import * as Phaser from 'phaser'
import PlayerSelector from './PlayerSelector'
import { PlayerBehavior } from '@agent-spaces/shared/skyoffice'
import { sittingShiftData, SittingDirection } from './Player'
import Player from './Player'
import Network from '../services/Network'
import Chair from '../items/Chair'

import { phaserEvents, Event } from '../events/EventCenter'
import { useChatStore } from '../stores/chat-store'
import { ItemType } from '@agent-spaces/shared/skyoffice'
import { NavKeys } from '../types/KeyboardState'
import { JoystickMovement } from '../components/Joystick'
import { openURL } from '../utils/helpers'

/**
 * MyPlayer —— 当前浏览器人类玩家，由 WASD / 方向键 / 虚拟摇杆控制。
 *
 * 已移除：
 *   - Computer / 屏幕共享相关分支
 *   - readyToConnect / videoConnected 字段
 *   - Whiteboard 相关交互
 *
 * 保留：
 *   - WASD / 方向键移动
 *   - E 坐下 / 起身（chair）
 *   - R 使用自动售货机（vending machine，仅外链）
 *   - 动画切换 + 网络同步
 */
export default class MyPlayer extends Player {
  private playContainerBody: Phaser.Physics.Arcade.Body
  private chairOnSit?: Chair
  public joystickMovement?: JoystickMovement
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, id, frame)
    this.playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
  }

  setPlayerName(name: string) {
    this.playerName.setText(name)
    phaserEvents.emit(Event.MY_PLAYER_NAME_CHANGE, name)
    useChatStore.getState().pushPlayerJoinedMessage(name)
  }

  setPlayerTexture(texture: string) {
    this.playerTexture = texture
    this.anims.play(`${this.playerTexture}_idle_down`, true)
    phaserEvents.emit(Event.MY_PLAYER_TEXTURE_CHANGE, this.x, this.y, this.anims.currentAnim?.key)
  }

  handleJoystickMovement(movement: JoystickMovement) {
    this.joystickMovement = movement
  }

  update(
    playerSelector: PlayerSelector,
    cursors: NavKeys,
    keyE: Phaser.Input.Keyboard.Key,
    keyR: Phaser.Input.Keyboard.Key,
    network: Network
  ) {
    if (!cursors) return

    const item = playerSelector.selectedItem

    if (Phaser.Input.Keyboard.JustDown(keyR)) {
      switch (item?.itemType) {
        case ItemType.VENDINGMACHINE:
          // hacky and hard-coded, but leaving it as is for now
          const url = 'https://www.buymeacoffee.com/skyoffice'
          openURL(url)
          break
      }
    }

    switch (this.playerBehavior) {
      case PlayerBehavior.IDLE:
        // if press E in front of selected chair
        if (Phaser.Input.Keyboard.JustDown(keyE) && item?.itemType === ItemType.CHAIR) {
          const chairItem = item as Chair
          /**
           * move player to the chair and play sit animation
           * a delay is called to wait for player movement (from previous velocity) to end
           * as the player tends to move one more frame before sitting down causing player
           * not sitting at the center of the chair
           */
          this.scene.time.addEvent({
            delay: 10,
            callback: () => {
              this.setVelocity(0, 0)
              if (chairItem.itemDirection) {
                const shift = sittingShiftData[chairItem.itemDirection as SittingDirection]
                this.setPosition(
                  chairItem.x + shift[0],
                  chairItem.y + shift[1]
                ).setDepth(chairItem.depth + shift[2])
                this.playContainerBody.setVelocity(0, 0)
                this.playerContainer.setPosition(
                  chairItem.x + shift[0],
                  chairItem.y + shift[1] - 30
                )
              }

              this.play(`${this.playerTexture}_sit_${chairItem.itemDirection}`, true)
              playerSelector.selectedItem = undefined
              if (chairItem.itemDirection === 'up') {
                playerSelector.setPosition(this.x, this.y - this.height)
              } else {
                playerSelector.setPosition(0, 0)
              }
              network.updatePlayer(this.x, this.y, this.anims.currentAnim!.key)
            },
            loop: false,
          })
          chairItem.clearDialogBox()
          chairItem.setDialogBox('Press E to leave')
          this.chairOnSit = chairItem
          this.playerBehavior = PlayerBehavior.SITTING
          return
        }

        const speed = 200
        let vx = 0
        let vy = 0

        let joystickLeft = false
        let joystickRight = false
        let joystickUp = false
        let joystickDown = false

        if (this.joystickMovement?.isMoving) {
          joystickLeft = this.joystickMovement.direction.left
          joystickRight = this.joystickMovement.direction.right
          joystickUp = this.joystickMovement.direction.up
          joystickDown = this.joystickMovement.direction.down
        }

        if (cursors.left?.isDown || cursors.A?.isDown || joystickLeft) vx -= speed
        if (cursors.right?.isDown || cursors.D?.isDown || joystickRight) vx += speed
        if (cursors.up?.isDown || cursors.W?.isDown || joystickUp) {
          vy -= speed
          this.setDepth(this.y)
        }
        if (cursors.down?.isDown || cursors.S?.isDown || joystickDown) {
          vy += speed
          this.setDepth(this.y)
        }
        this.setVelocity(vx, vy)
        this.body!.velocity.setLength(speed)
        this.playContainerBody.setVelocity(vx, vy)
        this.playContainerBody.velocity.setLength(speed)

        if (vx !== 0 || vy !== 0) network.updatePlayer(this.x, this.y, this.anims.currentAnim!.key)
        if (vx > 0) {
          this.play(`${this.playerTexture}_run_right`, true)
        } else if (vx < 0) {
          this.play(`${this.playerTexture}_run_left`, true)
        } else if (vy > 0) {
          this.play(`${this.playerTexture}_run_down`, true)
        } else if (vy < 0) {
          this.play(`${this.playerTexture}_run_up`, true)
        } else {
          const parts = this.anims.currentAnim!.key.split('_')
          parts[1] = 'idle'
          const newAnim = parts.join('_')
          if (this.anims.currentAnim!.key !== newAnim) {
            this.play(parts.join('_'), true)
            network.updatePlayer(this.x, this.y, this.anims.currentAnim!.key)
          }
        }
        break

      case PlayerBehavior.SITTING:
        if (Phaser.Input.Keyboard.JustDown(keyE)) {
          const parts = this.anims.currentAnim!.key.split('_')
          parts[1] = 'idle'
          this.play(parts.join('_'), true)
          this.playerBehavior = PlayerBehavior.IDLE
          this.chairOnSit?.clearDialogBox()
          playerSelector.setPosition(this.x, this.y)
          playerSelector.update(this, cursors)
          network.updatePlayer(this.x, this.y, this.anims.currentAnim!.key)
        }
        break
    }
  }
}

declare global {
  namespace Phaser.GameObjects {
    interface GameObjectFactory {
      myPlayer(x: number, y: number, texture: string, id: string, frame?: string | number): MyPlayer
    }
  }
}

Phaser.GameObjects.GameObjectFactory.register(
  'myPlayer',
  function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    const sprite = new MyPlayer(this.scene, x, y, texture, id, frame)

    this.displayList.add(sprite)
    this.updateList.add(sprite)

    this.scene.physics.world.enableBody(sprite, Phaser.Physics.Arcade.DYNAMIC_BODY)

    const collisionScale = [0.5, 0.2]
    ;(sprite.body as Phaser.Physics.Arcade.Body)
      .setSize(sprite.width * collisionScale[0], sprite.height * collisionScale[1])
      .setOffset(
        sprite.width * (1 - collisionScale[0]) * 0.5,
        sprite.height * (1 - collisionScale[1])
      )

    return sprite
  }
)
