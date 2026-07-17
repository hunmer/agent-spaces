# Agent Teams Integration Guide

This guide explains how to drive Agent Teams from any external system (Python, Node.js, Go, etc.) via HTTP API and WebSocket broadcast.

## Architecture Overview

```
External Agent  ──HTTP──►  /api/rooms/*   (create / list / delete rooms, manage agents)
                ──WS────►  /agent-ws       (push real-time agent updates: spawn / move / talk / action)
                              │
                              ▼
                        Colyseus Room (in-memory state)
                              │  (auto state diff)
                              ▼
                        Browser Viewers (Phaser + React, render agents + allow WASD human control)
```

Key design:
- Agents are identified by **your custom `agentId`**, NOT by Colyseus session IDs. One WS connection can drive any number of agents.
- All agent state lives in memory (lost on server restart). Rooms can be explicitly deleted via HTTP.
- Browser viewers don't need a token — they just need the `roomId`. Only Agent endpoints require a token.

---

## Quickstart

```bash
# 1. Start the server
cd server && npm start

# 2. Run the TypeScript demo (creates a room + spawns agents + moves them)
npx ts-node examples/agent-client.ts

# 3. Or the Python version
pip install websockets httpx
python examples/agent-client.py

# 4. Open the browser client
cd client && npm run dev
# Visit http://localhost:5173, click "Join Custom Room", enter the roomId printed above
```

---

## HTTP API

Base URL: `http://localhost:2567/api`

Authentication: all room-scoped endpoints require a `token`. Pass it via:
- Query string: `?token=xxx`
- Header: `Authorization: Bearer xxx`

### `POST /api/rooms` — Create a room

No auth required.

**Body** (all optional):
```json
{ "name": "My Team", "description": "...", "autoDispose": false }
```

**Response** `200`:
```json
{
  "roomId": "d4cfc85124985e90",
  "token": "4001a2bbad36d30ff159d79bcfccf6f325439b8753bbf397",
  "wsUrl": "ws://localhost:2567/agent-ws?roomId=d4cfc85124985e90&token=4001a2b...",
  "name": "My Team",
  "description": "...",
  "createdAt": 1784274665841
}
```

> ⚠️ Save the `token` — it's the only way to manage this room later.

### `GET /api/rooms` — List rooms

No auth. Returns room metadata (without tokens).

### `GET /api/rooms/:roomId` — Get room info

Requires token. Returns room info + current agent list + subscriber count.

### `DELETE /api/rooms/:roomId` — Delete room

Requires token. Notifies all WS connections, disconnects viewers, disposes state.

### `GET /api/rooms/:roomId/agents` — List agents

Requires token.

### `POST /api/rooms/:roomId/agents` — Spawn an agent via HTTP

Requires token. Body:
```json
{ "agentId": "leader", "name": "Team Lead", "texture": "lucy", "x": 700, "y": 500 }
```

### `DELETE /api/rooms/:roomId/agents/:agentId` — Despawn an agent

Requires token.

### `POST /api/rooms/:roomId/broadcast` — Push a single broadcast via HTTP

Requires token. Body is any valid broadcast payload (see below). Useful for one-shot events; for high-frequency updates use WS.

---

## WebSocket Broadcast API

Endpoint: `ws://localhost:2567/agent-ws?roomId=xxx&token=yyy`

Connect once per controller (not per agent). Send JSON text messages.

### Message types

#### `agent.spawn` — Create or reset an agent
```json
{
  "type": "agent.spawn",
  "agentId": "leader",
  "name": "Team Lead",
  "texture": "lucy",
  "x": 700,
  "y": 500,
  "anim": "lucy_idle_down",
  "action": "idle"
}
```
If the agent already exists, fields are updated (no respawn).

#### `agent.update` — Move / change animation (most frequent)
```json
{ "type": "agent.update", "agentId": "leader", "x": 710, "y": 510, "anim": "lucy_run_right" }
```
If the agent doesn't exist yet, it's auto-spawned with defaults.

#### `agent.talk` — Show a speech bubble
```json
{ "type": "agent.talk", "agentId": "leader", "text": "Hello team!", "durationMs": 5000 }
```
`durationMs` defaults to 6000. The bubble is cleared automatically after expiry.

#### `agent.action` — Change action label
```json
{ "type": "agent.action", "agentId": "leader", "action": "wave", "x": 720, "y": 510 }
```
Action is a free-form string for UI/logging purposes (`idle` | `sit` | `work` | `wave` | ...).

#### `agent.activity` — Switch activity zone (recommended way to "go sit somewhere")

```json
{ "type": "agent.activity", "agentId": "leader", "activity": "meeting" }
```

`activity` is one of:

| Activity | Behavior |
|---|---|
| `working` | Walk to the workstation area (left side) and sit at a desk |
| `meeting` | Walk to the meeting room (top-right) and sit around the conference table |
| `relaxing` | Walk to the lounge/tavern area (bottom-right + sofa) and sit |
| `idle` | Stand up where you are (releases the currently occupied chair) |

When you send `working` / `meeting` / `relaxing`:
- The server picks a free chair in that zone (chair-lock prevents two agents from sharing one)
- It writes `targetX`, `targetY`, `targetDir` into the agent state
- The browser viewer sees the change and **walks the agent to the chair with a smooth tween**, then plays the sit animation
- You don't need to send per-frame coordinates — the walk is fully client-side animated

When you send `idle`:
- The server releases the agent's currently occupied chair (so another agent can use it)
- The agent stands in place with `idle_down` animation

Example — team splits up:
```js
await client.sendBatch([
  { type: 'agent.activity', agentId: 'leader', activity: 'meeting' },
  { type: 'agent.activity', agentId: 'dev-1',  activity: 'working' },
  { type: 'agent.activity', agentId: 'dev-2',  activity: 'relaxing' },
])
```

#### `agent.sit` — Convenience for sitting (legacy)
```json
{ "type": "agent.sit", "agentId": "leader", "x": 600, "y": 500 }
```
Equivalent to `agent.action` with `action: "sit"`. Prefer `agent.activity` for zone-based sitting.

#### `agent.despawn` — Remove an agent
```json
{ "type": "agent.despawn", "agentId": "leader" }
```

### Batch messages (team coordination)

Send an array to atomically push multiple updates in one frame:
```json
[
  { "type": "agent.update", "agentId": "a1", "x": 100, "y": 200 },
  { "type": "agent.talk",   "agentId": "a2", "text": "Roger" },
  { "type": "agent.action", "agentId": "a1", "action": "work" }
]
```

### Server responses

- Each single message gets an ack: `{ "ok": true, "type": "agent.update", "agentId": "a1" }`
- Batch messages get: `{ "type": "batch_ack", "results": [...] }`
- Errors: `{ "ok": false, "error": "agentId required", "type": "agent.foo" }`

### Multi-agent awareness (fanout)

When agent A pushes a message, it's forwarded to all other WS connections in the same room as:
```json
{ "source": "broadcast", "payload": { "type": "agent.talk", "agentId": "a1", "text": "..." } }
```
This lets independent agent processes observe each other (useful for multi-agent coordination).

### Room lifecycle events

- `{ "type": "connected", "roomId": "..." }` — sent on successful connect
- `{ "type": "room_closed", "roomId": "..." }` — sent before socket close when room is deleted

---

## Coordinate system

The default map is a top-down office. Approximate walkable bounds:
- X: `0` – `1500` (pixels)
- Y: `0` – `1000` (pixels)
- Default spawn: `(705, 500)`

Available textures (sprite sheets): `adam`, `ash`, `lucy`, `nancy`.

Animation naming convention: `<texture>_<state>_<direction>`:
- States: `idle`, `run`, `sit`
- Directions: `up`, `down`, `left`, `right`

Examples: `adam_idle_down`, `lucy_run_right`, `ash_sit_up`.

---

## Human viewer behavior

Browser viewers (humans) connect as regular Colyseus clients:
- They control their own character with WASD / arrow keys
- They can sit on chairs (press `E`) and use whiteboards (press `R`)
- They see all agents in real-time with smooth interpolated movement
- They don't need a token — only the `roomId`
- The "Agent Activity" feed (bottom-left, or press Enter) shows a live log of agent events

A room can have many viewers; viewers don't affect agent state.
