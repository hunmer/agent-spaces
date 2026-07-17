// 验证 DELEGATE_AGENT_TALK 路径：viewer 通过 Colyseus 让 agent 说话
// 运行：node examples/talk-test.js
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
  const r1 = await fetch(`${SERVER}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Talk Test', autoDispose: false }),
  })
  const room = await r1.json()
  console.log(`✓ room: ${room.roomId}`)

  await fetch(`${SERVER}/api/rooms/${room.roomId}/agents?token=${room.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: 'a1', name: 'Agent', texture: 'lucy', x: 700, y: 500 }),
  })
  console.log('✓ agent spawned')

  const { Client } = loadColyseus()
  const client = new Client(`ws://${new URL(SERVER).host}`)
  const colyseusRoom = await client.joinById(room.colyseusRoomId)
  console.log('✓ viewer joined')

  await new Promise((r) => setTimeout(r, 400))

  // Message 枚举：DELEGATE_AGENT_TALK = 9
  colyseusRoom.send(9, { agentId: 'a1', text: 'Hello from debug panel!' })

  await new Promise((r) => setTimeout(r, 500))

  let agentText = ''
  let textUntil = 0
  colyseusRoom.state.agents.forEach((a) => {
    if (a.id === 'a1') {
      agentText = a.text
      textUntil = a.textUntil
    }
  })

  console.log(`  agent.text = ${JSON.stringify(agentText)}`)
  console.log(`  agent.textUntil = ${textUntil} (>now: ${textUntil > Date.now()})`)

  if (agentText === 'Hello from debug panel!' && textUntil > Date.now()) {
    console.log('\n✅ DELEGATE_AGENT_TALK 路径正常，测试消息已送达')
    console.log('   DebugPanel 的预设消息按钮可以正常让 agent 说话')
  } else {
    console.log('\n❌ 消息未送达')
  }

  colyseusRoom.leave()
  setTimeout(() => process.exit(0), 300)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
