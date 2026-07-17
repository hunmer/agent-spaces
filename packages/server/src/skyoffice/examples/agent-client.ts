/**
 * Agent Teams 客户端示例（TypeScript / Node.js）
 *
 * 演示如何：
 *   1. 通过 HTTP API 创建房间
 *   2. 通过 WS 连接广播通道
 *   3. 推送 agent 的 spawn / 移动 / 说话 / 动作
 *   4. 一个连接控制多个 agent（团队协作）
 *
 * 运行：
 *   npx ts-node examples/agent-client.ts
 *
 * 前置：服务端已启动 (cd server && yarn start 或 npm start)
 */
import WebSocket from 'ws'

const SERVER = process.env.SERVER || 'http://localhost:2567'

interface CreateRoomResponse {
  roomId: string
  token: string
  wsUrl: string
}

async function createRoom(name: string): Promise<CreateRoomResponse> {
  const res = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: 'Agent team demo', autoDispose: false }),
  })
  if (!res.ok) throw new Error(`createRoom failed: ${res.status} ${await res.text()}`)
  return res.json()
}

class AgentClient {
  private ws: WebSocket
  constructor(private wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => {
        // 等待服务端发来的 connected 帧
        this.ws.once('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'connected') resolve()
          else reject(new Error(`unexpected first message: ${JSON.stringify(msg)}`))
        })
      })
      this.ws.on('error', reject)
    })
  }

  /** 发送单条广播并等待 ack */
  send(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // 等待带 ok 字段的 ack（type 和 agentId 匹配）
      const handler = (raw: import('ws').RawData) => {
        let msg: any
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }
        // 跳过其他 agent 的扇出广播
        if (msg.source === 'broadcast') return
        // 匹配 ack：必须有 ok 字段，且 type/agentId 之一能对上
        if (msg.ok !== undefined) {
          this.ws.off('message', handler)
          clearTimeout(timer)
          resolve(msg)
        }
      }
      const timer = setTimeout(() => {
        this.ws.off('message', handler)
        reject(new Error(`ack timeout for ${payload.type} ${payload.agentId}`))
      }, 3000)
      this.ws.on('message', handler)
      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) {
          this.ws.off('message', handler)
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  /** 批量发送（团队同时行动） */
  sendBatch(payloads: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const handler = (raw: import('ws').RawData) => {
        let msg: any
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (msg.source === 'broadcast') return
        if (msg.type === 'batch_ack') {
          this.ws.off('message', handler)
          clearTimeout(timer)
          resolve(msg)
        }
      }
      const timer = setTimeout(() => {
        this.ws.off('message', handler)
        reject(new Error('batch_ack timeout'))
      }, 3000)
      this.ws.on('message', handler)
      this.ws.send(JSON.stringify(payloads), (err) => {
        if (err) {
          this.ws.off('message', handler)
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  /** 监听其他 agent 的广播（协作感知） */
  onBroadcast(cb: (payload: any) => void): void {
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.source === 'broadcast') cb(msg.payload)
      } catch {}
    })
  }

  close(): void {
    this.ws.close()
  }
}

async function main() {
  console.log('=== 1. 创建房间 ===')
  const room = await createRoom('Agent Team Demo')
  console.log(`roomId=${room.roomId}`)
  console.log(`token=${room.token}`)

  console.log('\n=== 2. 连接 WS 广播通道 ===')
  const client = new AgentClient(room.wsUrl)
  await client.connect()
  console.log('✓ connected')

  // 监听其他 agent 的广播（多 agent 协作感知）
  client.onBroadcast((p) => {
    console.log(`  [broadcast from peer] ${p.type} ${p.agentId}`)
  })

  console.log('\n=== 3. Spawn 两个 agent（团队） ===')
  console.log(
    '  leader:',
    JSON.stringify(
      await client.send({
        type: 'agent.spawn',
        agentId: 'leader',
        name: 'Team Lead',
        texture: 'lucy',
        x: 700,
        y: 500,
      })
    )
  )
  console.log(
    '  dev-1: ',
    JSON.stringify(
      await client.send({
        type: 'agent.spawn',
        agentId: 'dev-1',
        name: 'Developer',
        texture: 'ash',
        x: 600,
        y: 500,
      })
    )
  )

  console.log('\n=== 4. Leader 说话 ===')
  console.log(
    '  ',
    JSON.stringify(
      await client.send({
        type: 'agent.talk',
        agentId: 'leader',
        text: '团队，开始冲刺！',
        durationMs: 5000,
      })
    )
  )

  console.log('\n=== 5. 团队同时行动（批量消息） ===')
  console.log(
    '  ',
    JSON.stringify(
      await client.sendBatch([
        { type: 'agent.action', agentId: 'leader', action: 'wave' },
        { type: 'agent.talk', agentId: 'dev-1', text: '收到！', durationMs: 3000 },
      ])
    )
  )

  console.log('\n=== 6. 切换活动状态（核心演示） ===')
  console.log('  → leader 去 meeting（会议室），dev-1 去 working（工位）')
  console.log(
    '  ',
    JSON.stringify(
      await client.sendBatch([
        { type: 'agent.activity', agentId: 'leader', activity: 'meeting' },
        { type: 'agent.activity', agentId: 'dev-1', activity: 'working' },
      ])
    )
  )
  // 等前端 tween 走完（按 ~3 秒，足够走到任何区域）
  await new Promise((r) => setTimeout(r, 4000))

  console.log('\n=== 7. 大家去 relaxing（酒馆休息）===')
  console.log(
    '  ',
    JSON.stringify(
      await client.sendBatch([
        { type: 'agent.activity', agentId: 'leader', activity: 'relaxing' },
        { type: 'agent.activity', agentId: 'dev-1', activity: 'relaxing' },
      ])
    )
  )
  await new Promise((r) => setTimeout(r, 4000))

  console.log('\n=== 8. 站起来 idle ===')
  console.log(
    '  ',
    JSON.stringify(
      await client.sendBatch([
        { type: 'agent.activity', agentId: 'leader', activity: 'idle' },
        { type: 'agent.activity', agentId: 'dev-1', activity: 'idle' },
      ])
    )
  )

  console.log('\n✓ 完成。打开前端 http://localhost:5173 观察 agent 走路 + 坐下动画。')
  console.log(`  在 RoomSelectionDialog 选 "Join Custom Room"，输入 roomId: ${room.roomId}`)
  console.log('\n按 Ctrl+C 退出（房间会保留，因为 autoDispose: false）')

  // 保持连接，让前端有时间观察
  await new Promise(() => {})
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
