# 窗口管理 插件

> 在 Workflow 中创建、导航、关闭、截图独立浏览器窗口，并能在窗口内执行任意 JavaScript 代码。

## 简介

本插件把桌面应用「独立窗口」的能力暴露为 Workflow 动作节点。Agent / 工作流可以打开一个浏览器窗口加载网页，注入脚本提取数据，或者截图回传结果。

插件类型：`client`（运行在桌面客户端进程中）。

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `create_window` | 创建独立浏览器窗口 |
| `navigate_window` | 把已存在的窗口导航到指定 URL |
| `inject_js` | 在指定窗口中执行 JavaScript 代码 |
| `screenshot_window` | 截取窗口图像（返回 DataURL） |
| `list_windows` | 列出当前所有打开的窗口 |
| `get_window_detail` | 获取单个窗口的详细信息 |
| `focus_window` | 把窗口置顶到前台 |
| `close_window` | 关闭窗口 |

## 节点字段

### create_window

- `url`：要打开的 URL（必填）
- `title`：窗口标题
- `width`：默认 1280
- `height`：默认 800
- 出参 `data`：`id`、`webContentsId`、`url`、`title`

### navigate_window

- `windowId`、`url`（均必填）
- 出参 `data.windowId`、`data.url`

### inject_js

- `windowId`（必填）
- `code`：JavaScript 代码（必填，节点类型为 `code` 编辑器）
- 出参 `data.result`：代码最后一个表达式的字符串化结果

### screenshot_window

- `windowId`（必填）
- 出参 `data.screenshot`：`data:image/png;base64,...` 格式的图片

### list_windows

- 入参：无
- 出参 `data.windows[]`：每项含 `id`、`title`、`url`

### get_window_detail

- `windowId`（必填）
- 出参 `data`：`id`、`title`、`url`、`width`、`height`

### focus_window / close_window

- `windowId`（必填）

## 使用示例

**示例 1：抓取渲染后的页面内容**

1. 「Create Window」打开目标页面，拿到 `data.id`
2. 「Inject JS Code」：
   ```js
   document.querySelectorAll('h2').forEach(h => h.innerText).join('\n')
   ```
3. 从 `data.result` 拿到所有二级标题

**示例 2：登录后截图**

1. 「Create Window」打开登录页
2. 「Inject JS Code」自动填充账号密码并提交
3. 等待几秒后「Screenshot Window」拿到截图

**示例 3：定时刷新窗口**

1. 「Create Window」
2. 循环：「Navigate Window」刷新到新 URL
3. 结束后「Close Window」

## 常见问题

- **找不到 `windowId`**：先调用「List Windows」拿当前 ID。
- **注入脚本无效**：某些页面启用了严格 CSP，需在窗口创建时调整 `webPreferences.webSecurity`。
- **截图空白**：等待页面加载完成再截图（可在「Inject JS Code」里 `await new Promise(r => setTimeout(r, 1500))`）。
- **跨域脚本错误**：CORS 限制无法读取第三方页面内部数据，可考虑让目标页面配合 `postMessage`。
- **关闭主窗口**：本插件只关闭「独立窗口」，主窗口由用户控制。

## 依赖

- 由桌面宿主（Electron / Tauri）提供 `ctx.api.createWindow / injectJS / screenshotWindow` 等底层能力
