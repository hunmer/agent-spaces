# 给 game-asset-canvas 添加 Agent 助手 + 暴露画布操作 tool

## 架构（零宿主改动，4 个文件全在 mini-app 内）

```
用户在预览页 Agent 气泡："加一个文生图节点，再连到图片展示节点"
   ↓ SSE
服务端 runMiniAppAgent：自动把 src/api.js 每个方法包装成 function tool
   ↓ Agent 决定调用 add_node({type:'textToImage'})
api.js handler 调 ctx.requestClient('canvas.addNodes', {nodes:[...]})
   ↓ WS 广播 miniApp.clientRequest
浏览器 Canvas 新增 useEffect 订阅 → 真正执行 setNodes/setEdges
   ↓
window.AgentSpaces.respondClientRequest(requestId, {nodeIds:[...]})
   ↓ WS 回服务端
Promise resolve → Agent 拿到节点 id → 继续对话（如 connect_nodes）
```

**复用既有能力（无需新写）**：
- 预览页内置 `MiniAppAgentPopover`（`mini-app-preview.tsx:242`）—— 由 `manifest.enableAgents + agents 种子` 驱动，自动出现在预览页右下角
- `ctx.requestClient` / `ctx.broadcast` / `ctx.readConfig`（mini-app-agent.ts ApiCtx）
- `window.AgentSpaces.onTaskEvent` 通配符订阅 `miniApp.*`（含 `miniApp.clientRequest`）
- `window.AgentSpaces.respondClientRequest(requestId, result, ok, error)` 回 RPC 响应
- Canvas 既有 `createNodeAt` / `setNodes` / `setEdges` / `focusNode` / `updateNodeData`

## 改动清单

### 1. `manifest.json`（修改）
新增字段（参考 ai_image_video 的 manifest 模式）：
```json
{
  "enableAgents": true,
  "agents": [
    {
      "id": "canvas-assistant",
      "name": "画布助手",
      "avatar": "🤖",
      "systemPrompt": "你是游戏资产画布的助手…（含 7 种节点类型说明 + 工作流引导）",
      "suggestions": ["加一个文生图节点", "把所有文生图节点连到图片展示", "清空便签节点"]
    }
  ]
}
```
服务器启动 `ensureAgentsConfigs()` 自动落地 `agents.json`（已存在则跳过，绝不覆盖）。

### 2. `src/api.js`（新增）
导出 7 个 handler，全部通过 `ctx.requestClient` RPC 到浏览器执行（因为节点/边状态在浏览器内存）：
- `list_nodes({type?})` → 返回节点摘要（id/type/label/position/data 摘要）
- `add_node({type, label?, position?, data?, focus?})` → RPC `canvas.addNode`，返回 `{nodeId}`
- `update_node({nodeId, data})` → RPC `canvas.updateNodeData`
- `delete_node({nodeId})` → RPC `canvas.deleteNode`
- `connect_nodes({sourceId, targetId})` → RPC `canvas.connectNodes`，返回 `{edgeId, ok}`
- `delete_edge({sourceId, targetId})` → RPC `canvas.deleteEdge`
- `get_canvas()` → RPC `canvas.getCanvas`，返回 `{nodes, edges, count}` 概览

参数校验 + 友好错误信息（type 不合法 / 节点不存在等），让 Agent 拿到可读错误自我修正。

### 3. `src/tools.js`（新增）
对应 7 个工具元数据：`name` + `description`（中文，含使用场景提示）+ `inputSchema`（JSON Schema，enum 列出所有节点类型）。Agent 启动时 runtime 自动注入；Agent 可先调 `get_mini_app_tools` 看描述。

### 4. `src/components/Canvas.jsx`（修改，+约 70 行）
新增一个 `useEffect`，订阅 `window.AgentSpaces.onTaskEvent`，处理 `miniApp.clientRequest`：
```js
case 'miniApp.clientRequest': {
  const { requestId, type, payload } = data;
  try {
    let result;
    switch (type) {
      case 'canvas.addNode':     result = handleAgentAddNode(payload); break;
      case 'canvas.updateNode':  updateNodeData(payload.nodeId, payload.data); result={ok:true}; break;
      case 'canvas.deleteNode':  handleDeleteNode(payload.nodeId); result={ok:true}; break;
      case 'canvas.connectNodes':result = handleAgentConnect(payload.sourceId, payload.targetId); break;
      case 'canvas.deleteEdge':  setEdges(prev=>prev.filter(e=>!(e.source===payload.sourceId&&e.target===payload.targetId))); result={ok:true}; break;
      case 'canvas.getCanvas':   result = { nodes: nodes.map(n=>({id,type,label,position})), edges, count: nodes.length }; break;
      default: throw new Error(`未知 canvas RPC 类型: ${type}`);
    }
    window.AgentSpaces.respondClientRequest?.(requestId, result);
  } catch (err) {
    window.AgentSpaces.respondClientRequest?.(requestId, null, false, err.message);
  }
}
```

复用既有逻辑：
- `handleAgentAddNode` = 调既有 `createNodeAt(type, payload.position, payload.data)` + 可选 `focusNode(id)`
- `handleAgentConnect` = 调既有 `addEdge` 模式（markerEnd + animated）

**deps**: `[nodes, edges, createNodeAt, updateNodeData, handleDeleteNode, focusNode, setEdges]` —— 用最新闭包避免拿到过期 nodes/edges。

## 验收步骤

1. 重启 web 服务（manifest 变更需重启使 `ensureAgentsConfigs` 落地 agents.json + enableAgents 生效）
2. 打开 game-asset-canvas 预览页 → 右下角出现 🤖 agent 气泡
3. 点建议词「加一个文生图节点」或自由输入「加 3 个便签节点」→ 画布自动出现节点
4. 输入「把所有文生图节点连到第一个图片展示节点」→ 出现连线
5. 输入「现在画布上有几个节点」→ agent 调 get_canvas 返回准确数量
6. 刷新页面 → 节点/连线持久化（useCanvasState 防抖保存，已具备）

## 后续优化（不在本轮）

- Agent 上下文感知：把当前选中节点 id 注入 systemPrompt（需 host-api 暴露 selection）
- 批量原子操作：add_nodes / connect_batch（减少 RPC 往返）
- 节点参数预填：add_node 时直接传 prompt/model（data.params）让 agent 一步到位建好可执行节点
- 画布内独立聊天面板（与选中节点联动显示上下文）