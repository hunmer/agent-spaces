# 入口与启动

## mini-app 注册入口

**`manifest.json`**（项目根目录）：

```json
{
  "id": "game-asset-canvas",
  "name": "游戏资产生成画布",
  "version": "1.0.0",
  "type": "react",
  "mainFile": "index.jsx",
  "icon": "🎮",
  "enableAgents": true,
  "agents": [{ "id": "canvas-assistant", ... }]
}
```

- 宿主扫到 `manifest.json` 后用 `react-renderer.tsx` 把 `src/index.jsx` 默认导出渲染进容器。
- `enableAgents: true` + `agents[]` 注册画布助手 agent（systemPrompt 内嵌节点类型清单和操作策略）。

## 代码入口（src/index.jsx）

```jsx
import { ReactFlowProvider } from '@xyflow/react';
import Canvas from './components/Canvas';

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="h-full min-h-0">
        <Canvas />
      </div>
    </ReactFlowProvider>
  );
}
```

- `<ReactFlowProvider>` 必须包在最外层（`useReactFlow`/`useNodesInitialized` 等 hook 依赖其 context）。
- `<Canvas>` 是编排层，所有业务逻辑下沉到 hooks。

## Canvas 启动流程

```
useWorkspaces()                     // 读 workspaces.json，拿 activeId（首次兜底 'default'）
   ↓ activeId 就绪
useCanvasState(activeId)            // loadCanvas 读 configs/workspaces/<activeId>/canvas.json
   ↓ loaded=true
Canvas 渲染门控：!activeId || !loaded → 显示「加载中…」（避免空数据闪烁）
   ↓
useWorkflow / useGenerationHistory / useSettings / useExecutionQueue / usePanelLayout
useImageOutputs → useExecutionQueue（onComplete 前向引用 addImageNodesFromUrls）
useNodeCrud / useNodeExecutions / useSelectionClipboard / useGroupOperations
useCanvasAgentRpc（订阅一次 WS）
useDecoratedNodes（注入 callbacks）
   ↓
<ResizablePanelGroup>
  <ResizablePanel id=canvas-main>  <Toolbar/> + <ReactFlow nodes={decoratedNodes}> + <MultiSelectToolbar/> + <DropNodeMenu/> </ResizablePanel>
  <ResizableHandle/>
  <ResizablePanel id=canvas-right> <RightPanel/> </ResizablePanel>
  <SettingsDialog/> <NodeFormDialog/> <NodeExecuteDialog/>
</ResizablePanelGroup>
```

## 工作区切换重载

`useCanvasState(workspaceId)` / `useGenerationHistory(workspaceId)` 接收 workspaceId，切换时 `useEffect([workspaceId])` 重载该工作区的节点/历史/分组。流程：

```
WorkspaceSwitcher 切换 → invokeService('switch_workspace', {id})
   → service 写 workspaces.json（activeId）
   → 广播 configChanged
   → useWorkspaces 更新 activeId
   → useCanvasState/useGenerationHistory 重载
   → Canvas 重新渲染（门控期间显示加载中）
```

## 宿主启动依赖

- **web 服务必须运行**：mini-app 在宿主前端渲染，所有 `window.AgentSpaces.*` API 由宿主提供。
- **首次启动日志**：`[mini-app-services] services file watcher started`（chokidar 监听 `mini-apps/*/src/services/*.{js,mjs,cjs}`）。
- **新 mini-app 发现**：手动建目录 + manifest.json（id=目录名），或插入 `mini-apps/index.json` 数组。

## 服务端单写者加载

`src/services/canvas.js` 在首次 `invokeService` 时**惰性加载**到 registry（`mini-app-services.ts` 的 `ensureServicesLoaded`）；chokidar watcher 监听文件变更，debounce 200ms 重载对应项目的 registry。**只重载已加载过的项目**。

## Agent RPC 启动

`useCanvasAgentRpc` 在 `Canvas` 挂载时 `useEffect([])` 调 `window.AgentSpaces.onTaskEvent(cb)` 订阅 WS，按 `event === 'miniApp.clientRequest'` 分流到节点/边操作。`respond(requestId, result)` 用 `AS.respondClientRequest` 回给服务端（Promise resolve）。

## 无构建步骤

- 项目**无 package.json**，无 npm install/build。
- 宿主 react-renderer 用 Babel/TS 即时编译 `index.jsx` 及其依赖图。
- 第三方库经宿主 allowlist 暴露（bare import）；vendor 库本地加载或 CDN dynamic import。
