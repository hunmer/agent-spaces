// 模拟 viewer 通过 Colyseus 发送 DELEGATE_AGENT_ACTIVITY，验证调试面板的权限路径
// 运行：node examples/debug-panel-test.js
//
// 前置：
//   1. 服务端已启动
//   2. 已用 agent-client.ts 创建了房间和 agent（或本脚本自动创建）
//
// 注意：colyseus.js 只在 client/node_modules 里，这里动态解析路径

const WebSocket = require('ws')
const path = require('path')

const SERVER = process.env.SERVER || 'http://localhost:2567'

// 动态找到 colyseus.js（优先 client/node_modules，其次 cwd）
function loadColyseus() {
  try {
    return require('colyseus.js')
  } catch {
    const candidates = [
      path.join(__dirname, '..', 'client', 'node_modules', 'colyseus.js'),
      path.join(process.cwd(), 'client', 'node_modules', 'colyseus.js'),
    ]
    for (const p of candidates) {
      try {
        return require(p)
      } catch {}
    }
    throw new Error('colyseus.js not found. Run from project root or install in client/.')
  }
}

async function main() {
  // 1. 创建房间（autoDispose:false 保证不消失）
  const r1 = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Debug Test', autoDispose: false }),
  })
  const room = await r1.json()
  console.log(`✓ room: ${room.roomId}`)

  // 2. 用 Agent WS spawn 一个 agent
  const ws = new WebSocket(room.wsUrl)
  await new Promise((res, rej) => {
    ws.once('open', res)
    ws.once('error', rej)
  })
  await new Promise((res) => ws.once('message', res)) // connected 帧
  ws.send(JSON.stringify({ type: 'agent.spawn', agentId: 'leader', name: 'Leader', texture: 'lucy', x: 700, y: 500 }))
  await new Promise((res) => ws.once('message', res)) // ack
  ws.close()
  console.log('✓ agent spawned')

  // 3. 模拟 viewer：用 Colyseus 客户端连接并发送 DELEGATE_AGENT_ACTIVITY
  const { Client } = loadColyseus()
  const client = new Client(`ws://${new URL(SERVER).host}`)
  console.log('  connecting as viewer...')
  const colyseusRoom = await client.joinById(room.colyseusRoomId)
  console.log('✓ viewer joined:', colyseusRoom.sessionId)

  // 4. 发送 DELEGATE_AGENT_ACTIVITY 切换到 working
  //    Message 枚举（types/Messages.ts）：
  //    UPDATE_PLAYER=0, UPDATE_PLAYER_NAME=1, ADD_CHAT_MESSAGE=2, SEND_ROOM_DATA=3,
  //    AGENT_TALK=4, AGENT_EVENT=5, DELEGATE_AGENT_ACTIVITY=6
  const DELEGATE_AGENT_ACTIVITY = 6
  colyseusRoom.send(DELEGATE_AGENT_ACTIVITY, { agentId: 'leader', activity: 'working' })

  await new Promise((r) => setTimeout(r, 500))

  // 5. 查询 HTTP 确认状态切换
  const r2 = await fetch(`${SERVER}/api/rooms/${room.roomId}/agents?token=${room.token}`)
  const data = await r2.json()
  const leader = data.agents.find((a) => a.id === 'leader')
  console.log('✓ leader activity:', leader.activity, 'target:', `(${leader.targetX},${leader.targetY},${leader.targetDir})`)

  if (leader.activity === 'working' && leader.targetX > 0) {
    console.log('\n✅ 调试面板的 DELEGATE_AGENT_ACTIVITY 路径工作正常！')
    console.log('   viewer 无需 token 即可切换 agent 状态')
  } else {
    console.log('\n❌ 状态未切换，检查 Message 枚举是否匹配')
  }

  colyseusRoom.leave()
  process.exit(0)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
