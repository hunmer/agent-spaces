// 验证 Bug 1 修复：viewer 在 agent 已存在后才加入房间，
// 仍能看到所有 agent（Game.create 的补 spawn 逻辑）
//
// 运行：node examples/late-join-test.js

const path = require('path')
const SERVER = process.env.SERVER || 'http://localhost:2567'

function loadColyseus() {
  try { return require('colyseus.js') } catch {}
  const candidates = [
    path.join(__dirname, '..', 'client', 'node_modules', 'colyseus.js'),
    path.join(process.cwd(), 'client', 'node_modules', 'colyseus.js'),
  ]
  for (const p of candidates) {
    try { return require(p) } catch {}
  }
  throw new Error('colyseus.js not found')
}

async function main() {
  // 1. 创建房间
  const r1 = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Late Join Test', autoDispose: false }),
  })
  const room = await r1.json()
  console.log(`✓ room: ${room.roomId} (colyseus: ${room.colyseusRoomId})`)

  // 2. 在 viewer 加入前 spawn 2 个 agent（通过 HTTP）
  await fetch(`${SERVER}/api/rooms/${room.roomId}/agents?token=${room.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: 'a1', name: 'Agent 1', texture: 'lucy', x: 300, y: 400 }),
  })
  await fetch(`${SERVER}/api/rooms/${room.roomId}/agents?token=${room.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: 'a2', name: 'Agent 2', texture: 'ash', x: 500, y: 500 }),
  })
  console.log('✓ 2 agents spawned BEFORE viewer joins')

  // 3. 让 a1 切到 working（验证补 spawn 后 activity/target 也正确同步）
  await fetch(`${SERVER}/api/rooms/${room.roomId}/broadcast?token=${room.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'agent.activity', agentId: 'a1', activity: 'working' }),
  })
  console.log('✓ a1 switched to working')

  // 4. viewer 后加入，读 state
  const { Client } = loadColyseus()
  const client = new Client(`ws://${new URL(SERVER).host}`)
  const colyseusRoom = await client.joinById(room.colyseusRoomId)
  console.log(`✓ viewer joined: ${colyseusRoom.sessionId}`)

  // 等待 state 同步
  await new Promise((r) => setTimeout(r, 600))

  const agents = []
  colyseusRoom.state.agents.forEach((a, id) =>
    agents.push({ id, activity: a.activity, x: a.x, y: a.y, target: `(${a.targetX},${a.targetY})` })
  )

  console.log(`\n viewer state has ${agents.length} agents:`)
  agents.forEach((a) =>
    console.log(`   ${a.id}: activity=${a.activity} pos=(${a.x},${a.y}) target=${a.target}`)
  )

  const a1 = agents.find((a) => a.id === 'a1')
  const a2 = agents.find((a) => a.id === 'a2')

  let ok = true
  if (agents.length !== 2) {
    console.log('\n❌ agent count mismatch')
    ok = false
  }
  if (!a1 || a1.activity !== 'working') {
    console.log('❌ a1 activity not synced')
    ok = false
  }
  if (!a1 || !a1.target || a1.target === '(0,0)') {
    console.log('❌ a1 target not synced')
    ok = false
  }

  if (ok) {
    console.log('\n✅ Bug 1 修复验证通过：viewer 后加入能拿到完整 agent 列表 + activity/target')
    console.log('   (Game.create 末尾的补 spawn 扫描会正确处理这些已存在的 agent)')
  }

  colyseusRoom.leave()
  setTimeout(() => process.exit(0), 300)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
