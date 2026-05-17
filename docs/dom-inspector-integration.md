# DOM Inspector 集成

基于 [dom-inspector-hook](https://github.com/zh-lx/code-inspector-plugin) 的元素源码定位功能。在被调试项目中按住 Alt+Shift 点击页面元素，自动在 Agent Spaces 编辑器中打开对应源码文件并跳转到行。

## 架构

```
被调试项目 (dom-inspector-hook)
  │  POST { path, line, column }
  ▼
Agent Spaces 后端 /api/inspector/track (免认证)
  │  WS broadcast inspector.jump
  ▼
Agent Spaces 前端 workspace-shell.tsx
  │  jumpToPosition(path, line, column)
  ▼
Monaco Editor 打开文件并定位到行
```

## 被调试项目配置

### 1. 安装依赖

```bash
npm install dom-inspector-hook code-inspector-plugin -D
```

### 2. 配置打包工具

以 Vite 为例（其他打包工具参考 [dom-inspector-hook README](../../dom-inspector-hook/README.md)）：

```js
// vite.config.js
import { defineConfig } from 'vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { createBehavior } from 'dom-inspector-hook'

export default defineConfig({
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
      behavior: createBehavior(),
    }),
  ],
})
```

### 移动端推荐

移动端无法使用键盘快捷键，配置 `showSwitch: true` 可在页面上显示一个代码审查开关按钮，点击即可切换审查模式开启/关闭，无需按住 Alt+Shift：

```js
codeInspectorPlugin({
  bundler: 'vite',
  behavior: createBehavior(),
  showSwitch: true, // 页面显示开关按钮，移动端友好
})
```

### 3. 绑定监听

在应用入口文件（如 `main.ts`）中：

```ts
import { bindCaptureListener } from 'dom-inspector-hook'

// 仅开发环境启用
if (process.env.NODE_ENV === 'development') {
  bindCaptureListener({
    url: 'http://localhost:3100/api/inspector/track',
    mode: 'http', // 静默 POST，无弹窗
  })
}
```

`url` 指向 Agent Spaces 后端地址。`mode: 'http'` 表示直接静默发送，不弹出选择对话框。

## 后端实现

- **路由**：`POST /api/inspector/track`，注册在 `app.ts` 中，位于认证中间件之前（免认证）
- **广播**：通过 `broadcastToAll('inspector.jump', { path, line, column })` 向所有 WebSocket 连接发送
- **文件**：`packages/server/src/ws/connection-manager.ts` 中的 `broadcastToAll` 函数

## 前端实现

- **事件监听**：`workspace-shell.tsx` 中监听 `inspector.jump` WS 事件
- **处理逻辑**：去掉 path 前导 `/` 后调用 `useEditorStore.getState().jumpToPosition(workspaceId, path, line, column)`
- **自动激活**：`jumpToPosition` 设置 `activeFilePath`，已有的 useEffect 自动切换 FlexLayout 到 code-editor tab

## POST 数据格式

dom-inspector-hook 发送的 JSON body：

```json
{
  "path": "/src/components/Button.tsx",
  "name": "Button",
  "line": 10,
  "column": 5,
  "timestamp": 1715961234567
}
```

后端只取 `path`、`line`、`column` 三个字段进行广播。
