import * as Phaser from 'phaser'
import Network from '../services/Network'
import { BackgroundMode } from '@agent-spaces/shared/skyoffice'
import { useUserStore } from '../stores/user-store'
import { useRoomStore } from '../stores/room-store'

/**
 * 资源根路径。Next.js public 目录下：public/assets/skyoffice/**。
 * 访问 URL 为 /assets/skyoffice/...（Next.js 的 /public 前缀不体现在 URL）。
 */
const ASSETS = '/assets/skyoffice'

export default class Bootstrap extends Phaser.Scene {
  private preloadComplete = false
  private launchPending = false
  private autoRegisterKeys = false
  network!: Network

  constructor() {
    super('bootstrap')
  }

  preload() {
    this.load.atlas('cloud_day', `${ASSETS}/background/cloud_day.png`, `${ASSETS}/background/cloud_day.json`)
    this.load.image('backdrop_day', `${ASSETS}/background/backdrop_day.png`)
    this.load.atlas('cloud_night', `${ASSETS}/background/cloud_night.png`, `${ASSETS}/background/cloud_night.json`)
    this.load.image('backdrop_night', `${ASSETS}/background/backdrop_night.png`)
    this.load.image('sun_moon', `${ASSETS}/background/sun_moon.png`)

    this.load.tilemapTiledJSON('tilemap', `${ASSETS}/map/map.json`)
    this.load.spritesheet('tiles_wall', `${ASSETS}/map/FloorAndGround.png`, { frameWidth: 32, frameHeight: 32 })
    this.load.spritesheet('chairs', `${ASSETS}/items/chair.png`, { frameWidth: 32, frameHeight: 64 })
    this.load.spritesheet('computers', `${ASSETS}/items/computer.png`, { frameWidth: 96, frameHeight: 64 })
    this.load.spritesheet('vendingmachines', `${ASSETS}/items/vendingmachine.png`, { frameWidth: 48, frameHeight: 72 })
    this.load.spritesheet('office', `${ASSETS}/tileset/Modern_Office_Black_Shadow.png`, { frameWidth: 32, frameHeight: 32 })
    this.load.spritesheet('basement', `${ASSETS}/tileset/Basement.png`, { frameWidth: 32, frameHeight: 32 })
    this.load.spritesheet('generic', `${ASSETS}/tileset/Generic.png`, { frameWidth: 32, frameHeight: 32 })
    this.load.spritesheet('adam', `${ASSETS}/character/adam.png`, { frameWidth: 32, frameHeight: 48 })
    this.load.spritesheet('ash', `${ASSETS}/character/ash.png`, { frameWidth: 32, frameHeight: 48 })
    this.load.spritesheet('lucy', `${ASSETS}/character/lucy.png`, { frameWidth: 32, frameHeight: 48 })
    this.load.spritesheet('nancy', `${ASSETS}/character/nancy.png`, { frameWidth: 32, frameHeight: 48 })

    this.load.on('complete', () => {
      this.preloadComplete = true
      this.launchBackground(useUserStore.getState().backgroundMode)
      if (this.launchPending) this.launchGame(this.autoRegisterKeys)
    })
  }

  init() {
    this.network = new Network()
  }

  private launchBackground(backgroundMode: BackgroundMode) {
    this.scene.launch('background', { backgroundMode })
  }

  launchGame(autoRegisterKeys = false) {
    this.autoRegisterKeys ||= autoRegisterKeys
    if (!this.preloadComplete) {
      this.launchPending = true
      return
    }
    this.launchPending = false
    this.scene.launch('game', { network: this.network, autoRegisterKeys: this.autoRegisterKeys })
    useRoomStore.getState().setRoomJoined(true)
  }

  changeBackgroundMode(backgroundMode: BackgroundMode) {
    this.scene.stop('background')
    this.launchBackground(backgroundMode)
  }
}
