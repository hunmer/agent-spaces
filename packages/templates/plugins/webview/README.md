# Webview 插件

> 在 Workflow 节点内部嵌入一个网页查看器（Webview）：Electron 桌面端使用 `<webview>`，Web 端自动回退到 `<iframe>`，开箱即用。

## 简介

很多工作流场景需要把一个外部网页嵌入到节点内部预览（仪表盘、可视化报表、文档系统等）。本插件演示如何用 `customView` 渲染一个支持跨端的 webview 节点。

插件类型：`server`，支持 `web` / `electron` 双端。

## 节点清单

| 节点 | 用途 | 最小尺寸 |
| --- | --- | --- |
| `open_webview` | 在节点内打开一个网页 | 420 × 300 |

## 节点字段

- `url`：要显示的 URL（必填），默认 `https://example.com`
- `title`：顶部栏标题，默认 `Webview`

**出参 `data`**：

- `url`、`title`、`fallback`

## 渲染策略

`customView` 内部会根据 `window.electronAPI` 是否存在来选择渲染方式：

| 运行时 | 使用元素 | 备注 |
| --- | --- | --- |
| Electron | `<webview>` | 桌面原生 webview，可与主进程双向通信 |
| 浏览器 / Web | `<iframe sandbox>` | 沙箱属性：`allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts` |

切换 `data.url` 时，组件会自动更新 iframe / webview 的 `src`。

## 使用示例

**示例 1：嵌入一个公开仪表盘**

1. 拖入「Open Webview」节点
2. `url = https://grafana.example.com/d/public-dashboard`
3. `title = 业务监控`
4. 节点会渲染出可缩放的 webview 面板

**示例 2：根据上游数据动态切换**

- 把上游节点的输出（变量替换）写入 `url`，每次工作流执行会刷新网页

## 常见问题

- **iframe 打开后白屏**：目标站点不允许嵌入（响应头 `X-Frame-Options` / `Content-Security-Policy` 的 `frame-ancestors`）。这是浏览器安全机制，无法绕过。
- **Electron 中加载空白**：检查 `webPreferences` 中是否允许该域名的 webview；某些协议（`file://`）需要单独设置 `webSecurity: false`。
- **登录态丢失**：iframe 默认 `referrerPolicy="no-referrer"`，不携带第三方 Cookie，如需登录态请改用 Electron `webview` 并配置 `partition`。
- **嵌入的页面很卡**：webview 是真实浏览器进程，请避免一次嵌入多个大页面。

## 自定义扩展

如果需要 webview 与节点交互（双向通信）：

- 在 React `customView` 中调用 `viewerRef.current.send` / `executeJavaScript`（Electron）
- 通过 `window.postMessage` 与 iframe 通信（Web）
