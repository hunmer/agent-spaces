import assert from 'node:assert/strict'
import { Client } from 'colyseus.js'

const server = process.env.SERVER_URL || 'http://localhost:3100'
const teamId = process.env.TEAM_ID || '7305b983-31fc-4cef-98df-87d6ee63f34c'

const created = await fetch(`${server}/api/skyoffice/team-rooms/${teamId}`, { method: 'POST' }).then((res) => res.json())
const joined = await fetch(`${server}/api/skyoffice/rooms/${created.roomId}/join`).then((res) => res.json())
const room = await new Client(server).joinById(joined.colyseusRoomId)
room.onMessage(5, () => {})
await new Promise((resolve) => setTimeout(resolve, 500))
const agents = Array.from(room.state.agents.values())

assert.ok(agents.length > 1, `expected team members, got ${agents.length}`)
const agent = agents[0]
room.send(6, { agentId: agent.id, activity: 'working' })
await new Promise((resolve) => setTimeout(resolve, 500))
assert.equal(agent.activity, 'working', 'team member activity did not switch')
assert.equal(new Set(agents.map(({ x, y }) => `${x},${y}`)).size, agents.length, 'team members overlap at one spawn point')

await room.leave()
console.log('skyoffice team room integration passed')
