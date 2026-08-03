# Findings

- `MiniAppPreview` 当前用 `chatDockOpen` 控制宿主外层 `ResizablePanel`，其中渲染 `MiniAppAgentDock`。
- React mini-app 由同页面内独立 React Root 渲染，不是 iframe，因此宿主可以用 React Portal 挂载到 mini-app 提供的 DOM 节点。
- `RightPanel` 是受控 Tabs，`Canvas.jsx` 持有 `rightTab`，适合通过 Host Slot 激活事件切换到 `chat`。
- `MiniAppProject` 字段是显式持久化/传递，新增 manifest 配置必须补服务端类型、导入和预览 props。
- Host Slot 注册表按 `projectId:name` 隔离，支持元素订阅、激活状态双向同步和卸载清理。
- 特殊模式中，Chat tab 的直接点击和宿主工具栏按钮都会同步 `chatDockOpen`；关闭 Chat 会恢复进入 Chat 前的 tab。
