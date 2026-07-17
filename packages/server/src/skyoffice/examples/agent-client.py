"""
Agent Teams 客户端示例（Python）

依赖：
    pip install websockets httpx

运行：
    python examples/agent-client.py

前置：服务端已启动 (cd server && npm start)
"""
import asyncio
import json
import os

import httpx
import websockets

SERVER = os.environ.get("SERVER", "http://localhost:2567")


async def create_room(name: str, auto_dispose: bool = False) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{SERVER}/api/rooms",
            json={"name": name, "description": "Python agent demo", "autoDispose": auto_dispose},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()


class AgentClient:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.ws = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url)
        # 等待 connected 帧
        first = json.loads(await self.ws.recv())
        assert first.get("type") == "connected", f"unexpected: {first}"

    async def send(self, payload: dict) -> dict:
        await self.ws.send(json.dumps(payload))
        # 读 ack
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("source") == "broadcast":
                continue  # 其他 agent 的扇出，先跳过
            return msg

    async def send_batch(self, payloads: list) -> dict:
        await self.ws.send(json.dumps(payloads))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("type") == "batch_ack":
                return msg


async def main():
    print("=== 1. 创建房间 ===")
    room = await create_room("Python Team")
    print(f"roomId={room['roomId']}")
    print(f"token={room['token']}")

    print("\n=== 2. 连接 WS ===")
    client = AgentClient(room["wsUrl"])
    await client.connect()
    print("✓ connected")

    print("\n=== 3. Spawn agent ===")
    print(await client.send({
        "type": "agent.spawn",
        "agentId": "py-agent",
        "name": "Researcher",
        "texture": "nancy",
        "x": 400,
        "y": 500,
    }))

    print("\n=== 4. 说话 ===")
    print(await client.send({
        "type": "agent.talk",
        "agentId": "py-agent",
        "text": "Hello from Python!",
        "durationMs": 5000,
    }))

    print("\n=== 5. 连续移动 ===")
    for i in range(10):
        await client.send({
            "type": "agent.update",
            "agentId": "py-agent",
            "x": 400 + i * 15,
            "y": 500,
            "anim": "nancy_run_right",
        })
        await asyncio.sleep(0.1)

    print("\n✓ 完成。前端用 roomId 加入观察:", room["roomId"])
    await client.ws.close()


if __name__ == "__main__":
    asyncio.run(main())
