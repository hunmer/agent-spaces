/**
 * 快速端到端验证脚本（Node.js, 纯 ws + 原生 fetch）
 *
 * 用法：
 *   1. 启动服务端：cd server && npm start
 *   2. 运行本脚本：node examples/e2e-test.js
 *
 * 它会：创建房间 → 连接 WS → 推送一系列广播 → 查询 HTTP 确认 state 被写入
 *
 * 适合 CI 或快速冒烟测试。
 */
const WebSocket = require('ws')

const SERVER = process.env.SERVER || 'http://localhost:2567'

async function main() {
  // 1. 创建房间
  const res = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Smoke', autoDispose: false }),
  })
  const room = await res.json()
  console.log(`✓ room created: ${room.roomId}`)

  // 2. 连接 WS
  const ws = new WebSocket(room.wsUrl)
  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  // 读取 connected 帧
  await new Promise((resolve) => {
    ws.once('message', () => resolve())
  })
  console.log('✓ ws connected')

  // 3. 推送广播
  const send = (p) => {
    ws.send(JSON.stringify(p))
  }
  send({ type: 'agent.spawn', agentId: 'a1', name: 'Alpha', texture: 'adam', x: 300, y: 400 })
  send({ type: 'agent.update', agentId: 'a1', x: 320, y: 410, anim: 'adam_run_right' })
  send({ type: 'agent.talk', agentId: 'a1', text: 'Hello!', durationMs: 5000 })
  send([
    { type: 'agent.update', agentId: 'a1', x: 340, y: 420 },
    { type: 'agent.action', agentId: 'a1', action: 'work' },
  ])

  // 等服务端处理 + ack 回来
  await new Promise((r) => setTimeout(r, 500))
  ws.close()
  console.log('✓ broadcasts sent')

  // 4. 通过 HTTP 确认 state
  const r2 = await fetch(`${SERVER}/api/rooms/${room.roomId}/agents?token=${room.token}`)
  const data = await r2.json()
  if (data.agents.length !== 1) {
    throw new Error(`expected 1 agent, got ${data.agents.length}`)
  }
  const a = data.agents[0]
  if (a.x !== 340 || a.y !== 420) {
    throw new Error(`position mismatch: x=${a.x} y=${a.y}`)
  }
  if (a.action !== 'work') {
    throw new Error(`action mismatch: ${a.action}`)
  }
  console.log(`✓ state verified: agent ${a.id} at (${a.x},${a.y}) action=${a.action}`)

  // 5. 清理：解散房间
  await fetch(`${SERVER}/api/rooms/${room.roomId}?token=${room.token}`, { method: 'DELETE' })
  console.log('✓ room deleted')

  console.log('\n✅ All smoke tests passed.')
}

main().catch((e) => {
  console.error('❌ FAILED:', e)
  process.exit(1)
})
