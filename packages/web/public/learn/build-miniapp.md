# 编写 MiniApp

本文聚焦开发者的实操要点：从零搭建一个 MiniApp，写源码、用宿主组件、接服务、挂 Agent。

## 1. 创建项目

`POST /api/mini-apps`，请求体 `{ name, type: 'react' | 'html' }`，名称全局唯一。或通过平台 UI 创建。

- React → 生成 `index.jsx` + `CLAUDE.md` 模板
- HTML → 生成最小 `index.html`

## 2. 项目结构

```text
~/.agent-spaces-data/mini-apps/{projectId}/
├── manifest.json        # 元数据
├── src/
│   ├── index.jsx        # 入口（react）
│   ├── api.js           # 可选：Agent 可调用的方法表
│   ├── services/*.js    # 可选：服务端处理函数
│   └── tools.js         # 可选：声明工具元数据
├── configs/             # JSON 配置（服务端单点写入）
├── data/
│   └── db/<name>.sqlite # 可选 SQLite
└── agents.json          # 可选：项目内 Agent
```

## 3. 用宿主组件

React 模式下，从 `window.AgentSpacesUI` 解构组件与 lucide 图标：

```jsx
const { Button, Card } = window.AgentSpacesUI;

export default function App() {
  return (
    <Card>
      <Button onClick={() => alert('hi')}>点我</Button>
    </Card>
  );
}
```

宿主分类约 9 类：actions / forms / layout / navigation / overlays / feedback / data-display / media / utilities。

白名单模块：`react`、`react-dom`、`@dnd-kit/*`、`@tiptap/*`、`@agent-spaces/ui` 等。未进入白名单的 bare import 不应自行写 shim。

## 4. 样式建议

Mini-app 不单独跑 Tailwind 扫描：

- 常见 utility class 可能可用，但不保证
- 任意值类（`w-[320px]`、`max-h-[calc(...)]`）不应假定可用
- **稳定效果优先用内联 `style`**，或注入带项目私有前缀的 `<style>`
- 优先复用 `window.AgentSpacesUI` / `@agent-spaces/ui` 组件

## 5. 配置与服务

### 配置（推荐路径）

```js
const { invokeService, getConfig, onConfigChanged } = window.AgentSpacesAPI;
```

- `getConfig(path)` — 读内存快照
- `onConfigChanged(cb)` — 订阅变更
- `invokeService(name, payload)` — 调用 services

配置由服务端单点写入，客户端只读快照 + 变更事件，适合多端同步。

### 服务（src/services/*.js）

```js
export default {
  saveDraft: (ctx, payload) => {
    ctx.writeConfig('draft.json', payload);
    ctx.broadcast('draftSaved', payload);
    return { ok: true };
  }
};
```

机制：剥离 import → ESM 转 CJS → `new Function` 沙箱。handler 获得 `MiniAppServiceContext`（`readConfig` / `writeConfig` / `broadcast` / `listRunningTasks`）。

## 6. SQLite 数据

```js
const db = window.AgentSpacesAPI.db('main');
db.run('CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, text TEXT)');
const rows = db.all('SELECT * FROM todos');
```

- 文件位于 `data/db/<name>.sqlite`
- 支持 `all` / `get` / `run` / `exec` 模式
- 事务：`POST /api/mini-apps/:id/db/:dbName/transaction`
- SQL 经安全校验，结果行数受上限保护

## 7. 挂 Agent

编辑 `agents.json` 声明项目内 Agent：

```json
{
  "enableAgents": true,
  "agents": [
    {
      "id": "helper",
      "name": "项目助手",
      "modelProvider": "openai-chat-completions",
      "providerId": "<provider-id>",
      "modelId": "glm-4.6",
      "systemPrompt": "你是这个项目的助手"
    }
  ]
}
```

Mini-app 内置 Agent 固定用 `langchain` 运行时。凭据优先级：preset → agent 本地字段 → 服务端默认。

### 让 Agent 调用项目代码

`api.js` 编译出的方法表会被包装成 function tool，同时注入 `get_mini_app_tools` 元工具。建议在 systemPrompt 里告诉 Agent：「先调 `get_mini_app_tools` 看描述」。

## 8. 预览与调试

- 预览页一次性加载所有源码，按 `manifest.mainFile` 解析入口
- 入口缺失会显式报错（不静默 fallback）
- 浏览器端 Babel 编译 + `new Function` 沙箱执行
- 服务端 → 客户端 RPC：`requestMiniAppClient`，超时 5s

## 9. 导入导出

- 导出：`GET /api/mini-apps/:id/export`（ZIP）
- 导入：`POST /api/mini-apps/import`（base64 ZIP，自动定位内容根）

## 10. 模板

平台内置模板位于 `packages/templates/mini-app/`（如 `minimax_tts`），通过 `index.json` 注册，可用于快速创建。
