import Phaser from 'phaser'
import Player, { sittingShiftData } from './Player'
import { IAgent, AgentActivity } from '../../../types/IAgent'
import { Point } from '../utils/pathfinding'

/**
 * AgentSprite —— 外部 Agent 推送的角色的前端渲染。
 *
 * 状态机：
 *   - IDLE：原地站立（activity=idle 或刚 spawn）
 *   - WALKING：正在 tween 走向目标椅子（activity 刚切换）
 *   - SITTING：已坐在椅子上（tween 完成或 viewer 后加入 snap）
 *
 * 关键设计：
 *   - 服务端在 activity 切换时会一次性写入 activity/targetX/Y/Dir/x/y/anim。
 *     其中 x/y/anim 是"目标值"（椅子坐标 + sit 动画）。
 *   - 前端在收到 activity 变化时启动 tween，从当前显示位置走到 targetX/Y。
 *   - 走路期间（isWalking=true），applyChange 忽略 x/y/anim，避免被目标值瞬移。
 *   - 走路完成后坐下，此时 sprite 位置与 state 的 x/y 一致，不会回弹。
 *
 * L 型路径（避免穿墙）：
 *   - 先沿 X 轴走到目标列，再沿 Y 轴走到目标行（或先 Y 后 X）
 *   - 选择两条路径中较短/不穿墙的那条
 *   - 走路期间按当前移动方向播放 run 动画
 */
export default class AgentSprite extends Player {
  agentId: string
  private playContainerBody: Phaser.Physics.Arcade.Body
  private currentText = ''

  /** 当前活动状态 */
  private currentActivity: AgentActivity = 'idle'
  /** 正在执行的走路 tween 链（用于切换状态时打断） */
  private walkingTweens: Phaser.Tweens.Tween[] = []
  /** 是否正在走路（走路期间禁用 applyChange 的 x/y/anim 响应） */
  private isWalking = false

  constructor(
    scene: Phaser.Scene,
    agent: IAgent,
    frame?: string | number
  ) {
    const texture = agent.texture || 'adam'
    super(scene, agent.x, agent.y, texture, agent.id, frame)
    this.agentId = agent.id

    this.playerName.setText(agent.name)

    if (agent.anim) {
      this.anims.play(agent.anim, true)
    }

    this.playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
    this.playContainerBody.enable = false

    // 同步初始 activity（viewer 后加入时 agent 可能已经在椅子上）
    this.currentActivity = (agent.activity as AgentActivity) || 'idle'
    if (this.currentActivity !== 'idle' && agent.targetX && agent.targetY) {
      // 已有目标椅子 —— 直接 snap 到椅子位置并坐下
      this.snapToChair(agent.targetX, agent.targetY, agent.targetDir || 'down')
    }
  }

  /**
   * 用整个 IAgent 对象同步状态（补 spawn 兜底用）。
   */
  syncFromAgent(agent: IAgent) {
    if (agent.name) this.playerName.setText(agent.name)
    if (agent.text && agent.text !== this.currentText) {
      this.currentText = agent.text
      this.updateDialogBubble(agent.text)
    }
  }

  /**
   * 按字段 patch 更新（来自 state.agents.onChange）。
   *
   * 注意：activity 切换时服务端同批写入 activity/targetX/Y/x/y/anim。
   * Game.handleAgentUpdated 检测到 activity 字段后会跳过 x/y/anim 的 applyChange，
   * 交给 handleAgentActivity → startWalkingTo 处理走路动画。
   *
   * 这里只处理非 activity 切换场景的字段更新（agent.update 自由移动、改名等）。
   * 额外兜底：走路期间（isWalking）也忽略 x/y/anim。
   */
  applyChange(field: string, value: any) {
    switch (field) {
      case 'name':
        if (typeof value === 'string') this.playerName.setText(value)
        break
      case 'x':
        if (typeof value === 'number' && !this.isWalking) {
          this.x = value
          this.playerContainer.x = value
        }
        break
      case 'y':
        if (typeof value === 'number' && !this.isWalking) {
          this.y = value
          this.playerContainer.y = value - 30
        }
        break
      case 'anim':
        if (typeof value === 'string' && !this.isWalking) {
          this.anims.play(value, true)
        }
        break
      case 'text':
        if (typeof value === 'string' && value) {
          this.currentText = value
          this.updateDialogBubble(value)
        }
        break
      case 'texture':
        if (typeof value === 'string' && this.scene.textures.exists(value)) {
          this.playerTexture = value
        }
        break
      // activity / targetX / targetY / targetDir 由 Game 场景通过
      // startWalkingTo / standIdle 专门处理，不在 applyChange 里响应
    }
  }

  /** Bridge 的 AGENT_TALK 广播触发（比 state diff 更快） */
  showTalk(text: string) {
    if (text === this.currentText) return
    this.currentText = text
    this.updateDialogBubble(text)
  }

  /**
   * 公开方法：让 Game 场景在检测到 activity 变化时调用。
   * 用 L 型路径走到目标椅子（先 X 后 Y，或先 Y 后 X），避免穿墙。
   */
  startWalkingTo(targetX: number, targetY: number, targetDir: string) {
    this.currentActivity = 'working' // 标记非 idle
    this.isWalking = true

    // 停止之前的 tween
    this.stopWalking()

    const startX = this.x
    const startY = this.y

    // 如果已经在目标位置（距离很近），直接坐下
    const dx = targetX - startX
    const dy = targetY - startY
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < 8) {
      this.finishWalking(targetX, targetY, targetDir)
      return
    }

    // L 型路径：两段 tween 串联
    // 方案 A：先 X 后 Y
    // 方案 B：先 Y 后 X
    // 这里默认用先 X 后 Y（地图主要是左右分区，横向移动更常见）
    // 两段时长按各自距离比例分配（总速度 200 px/s）
    const speed = 200 // px/s
    const durX = Math.abs(dx) / speed * 1000
    const durY = Math.abs(dy) / speed * 1000

    // 第一段：水平移动到 targetX
    if (Math.abs(dx) > 1) {
      const horizDir = dx > 0 ? 'right' : 'left'
      this.anims.play(`${this.playerTexture}_run_${horizDir}`, true)
      const tween1 = this.scene.tweens.add({
        targets: this,
        x: targetX,
        duration: Math.max(150, durX),
        ease: 'linear',
        onUpdate: () => {
          this.playerContainer.x = this.x
          this.setDepth(this.y)
        },
      })
      this.walkingTweens.push(tween1)
    }

    // 第二段：垂直移动到 targetY（衔接第一段）
    if (Math.abs(dy) > 1) {
      const vertDir = dy > 0 ? 'down' : 'up'
      const tween2 = this.scene.tweens.add({
        targets: this,
        y: targetY,
        duration: Math.max(150, durY),
        ease: 'linear',
        onStart: () => {
          // 切换为垂直方向的 run 动画
          this.anims.play(`${this.playerTexture}_run_${vertDir}`, true)
        },
        onUpdate: () => {
          this.playerContainer.y = this.y - 30
          this.setDepth(this.y)
        },
      })
      this.walkingTweens.push(tween2)
    }

    // 全部走完后坐下（用 timeline 或最后一个 tween 的 onComplete）
    // 这里用 delayedCall 等总时长，简单可靠
    const totalDuration = Math.max(150, durX) + Math.max(150, durY)
    this.scene.time.delayedCall(totalDuration + 50, () => {
      // 确认中间没被打断（没切到别的状态）
      if (this.isWalking) {
        this.finishWalking(targetX, targetY, targetDir)
      }
    })
  }

  /** 走路完成：snap 到目标，坐下 */
  startWalkingPath(targetX: number, targetY: number, targetDir: string, path: Point[]) {
    this.currentActivity = 'working'
    this.stopWalking()

    if (Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY) < 8) {
      this.finishWalking(targetX, targetY, targetDir)
      return
    }
    if (!path.length) {
      console.warn(`[agent-path] no walkable path for ${this.agentId}`)
      this.isWalking = false
      return
    }

    this.isWalking = true
    const waypoints = [...path.slice(1), { x: targetX, y: targetY }]
    const walkNext = () => {
      const next = waypoints.shift()
      if (!next) {
        this.finishWalking(targetX, targetY, targetDir)
        return
      }

      const moveX = next.x - this.x
      const moveY = next.y - this.y
      const direction = Math.abs(moveX) >= Math.abs(moveY)
        ? (moveX > 0 ? 'right' : 'left')
        : (moveY > 0 ? 'down' : 'up')
      this.anims.play(`${this.playerTexture}_run_${direction}`, true)
      const tween = this.scene.tweens.add({
        targets: this,
        x: next.x,
        y: next.y,
        duration: Math.max(50, Math.hypot(moveX, moveY) / 200 * 1000),
        ease: 'linear',
        onUpdate: () => {
          this.playerContainer.x = this.x
          this.playerContainer.y = this.y - 30
          this.setDepth(this.y)
        },
        onComplete: walkNext,
      })
      this.walkingTweens = [tween]
    }
    walkNext()
  }

  private finishWalking(targetX: number, targetY: number, targetDir: string) {
    this.isWalking = false
    this.walkingTweens = []
    this.x = targetX
    this.y = targetY
    this.playerContainer.x = targetX
    this.playerContainer.y = targetY - 30
    this.setDepth(targetY)
    this.sitDown(targetDir)
  }

  /** 停止当前所有走路 tween */
  private stopWalking() {
    this.walkingTweens.forEach((t) => t.stop())
    this.walkingTweens = []
  }

  /**
   * activity 切回 idle：从椅子上站起来，往椅子前方走一小段到空地，然后站立。
   *
   * 用户期望：切 idle 后 agent 不要继续贴在椅子上，而是走到附近空地。
   * 实现方式：根据当前 sit 动画推断面朝方向，朝该方向走 40px，然后站立。
   * 这是纯前端动画，不写回 state（state 里 x/y 不变，仍为椅子坐标）。
   *   - 如果其他 viewer 后加入，state 显示 agent 在椅子坐标 → snapToChair 会坐下
   *   - 但因为 activity=idle，AgentSprite 构造时不会 snapToChair，而是直接站立
   */
  standIdle() {
    this.currentActivity = 'idle'
    this.stopWalking()

    // 从当前 sit 动画推断方向（如 lucy_sit_down → down）
    const animParts = this.anims.currentAnim?.key.split('_') || []
    const sitDir = animParts[1] === 'sit' ? animParts[2] : ''

    // 朝面朝方向走 40px 离开椅子
    const STEP = 40
    let dx = 0
    let dy = 0
    if (sitDir === 'up') dy = -STEP
    else if (sitDir === 'down') dy = STEP
    else if (sitDir === 'left') dx = -STEP
    else if (sitDir === 'right') dx = STEP
    else dy = STEP // 默认往下走

    // 如果位移很小（本来就没坐着），直接站立
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      this.isWalking = false
      this.anims.play(`${this.playerTexture}_idle_down`, true)
      return
    }

    this.isWalking = true
    const targetX = this.x + dx
    const targetY = this.y + dy
    const distance = Math.sqrt(dx * dx + dy * dy)
    const duration = (distance / 200) * 1000 // 200 px/s

    // 播放对应方向的 run 动画
    const runDir = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up')
    this.anims.play(`${this.playerTexture}_run_${runDir}`, true)

    const tween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration,
      ease: 'linear',
      onUpdate: () => {
        this.playerContainer.x = this.x
        this.playerContainer.y = this.y - 30
        this.setDepth(this.y)
      },
      onComplete: () => {
        this.isWalking = false
        this.walkingTweens = []
        // 站立时面朝原方向
        const idleDir = sitDir || 'down'
        this.anims.play(`${this.playerTexture}_idle_${idleDir}`, true)
      },
    })
    this.walkingTweens.push(tween)
  }

  /** 到达椅子后坐下 */
  private sitDown(dir: string) {
    const safeDir = ['up', 'down', 'left', 'right'].includes(dir) ? dir : 'down'
    this.anims.play(`${this.playerTexture}_sit_${safeDir}`, true)
    const shift = sittingShiftData[safeDir as keyof typeof sittingShiftData]
    if (shift) {
      this.setDepth(this.depth + shift[2])
    }
  }

  /** viewer 后加入时 agent 已在椅子上：直接 snap 并坐下 */
  private snapToChair(targetX: number, targetY: number, targetDir: string) {
    this.x = targetX
    this.y = targetY
    this.playerContainer.x = targetX
    this.playerContainer.y = targetY - 30
    this.setDepth(targetY)
    this.sitDown(targetDir)
    this.isWalking = false
  }

  destroy(fromScene?: boolean) {
    this.stopWalking()
    this.playerContainer.destroy()
    super.destroy(fromScene)
  }

  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt)
    // 走路 tween 和坐下状态都不做插值移动
    // （外部 agent 不通过 agent.update 推位置，位置完全由 activity 状态机控制）
  }
}

declare global {
  namespace Phaser.GameObjects {
    interface GameObjectFactory {
      agentSprite(agent: IAgent): AgentSprite
    }
  }
}

Phaser.GameObjects.GameObjectFactory.register(
  'agentSprite',
  function (this: Phaser.GameObjects.GameObjectFactory, agent: IAgent) {
    const sprite = new AgentSprite(this.scene, agent)

    this.displayList.add(sprite)
    this.updateList.add(sprite)

    return sprite
  }
)
