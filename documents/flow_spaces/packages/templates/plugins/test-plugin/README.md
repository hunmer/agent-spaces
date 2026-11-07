# Test Plugin（Web 客户端插件示例）

> 一个最简化的 Web / Electron 客户端插件示例，演示如何通过 CDN 加载插件入口和视图组件。

## 简介

与 `server` 类插件不同，`client` 类插件运行在 **桌面应用 / 浏览器** 端。本插件的入口和视图都通过远程 CDN 加载，激活时会往 `context.storage` 写入激活时间。

该插件主要用于插件开发者的参考模板：演示 CDN 加载、ESM/CJS 双格式、视图组件编写。

插件类型：`client`（含 `view`）。

## 文件结构

```
test-plugin/
├── web-plugin.json     # 插件清单（含 CDN 入口）
├── web-client.js       # 客户端入口（ESM）
└── view.js             # 视图组件（CJS / Vue options）
```

## 关键字段说明

### web-plugin.json

```json
{
  "id": "workflow.test-plugin",
  "type": "client",
  "hasView": true,
  "runtimeTargets": ["web", "electron"],
  "entries": {
    "client": { "url": "https://.../web-client.js", "format": "esm" },
    "view":   { "url": "https://.../view.js",     "format": "cjs" }
  }
}
```

- `type: "client"`：浏览器端运行
- `runtimeTargets`：声明兼容的运行时
- `entries.client`：客户端入口，ESM 模块，导出 `activate` / `deactivate`
- `entries.view`：视图组件，CJS 模块，导出 `data()` / `template`
- `iconUrl`：远程图标

### web-client.js

```js
export async function activate(context) {
  context.logger.info('web test plugin activated')
  await context.storage.set('activatedAt', Date.now())
}

export async function deactivate(context) {
  context.logger.info('web test plugin deactivated')
}
```

- 接收 `context`，可用 `logger`、`storage`、`api` 等能力
- `activate` / `deactivate` 均为可选

### view.js

```js
module.exports = {
  data() { return { status: 'CDN plugin is active' } },
  template: `...`
}
```

- 采用 Vue Options API：`data()` 返回响应式状态，`template` 是字符串模板
- `pluginInfo.description` 由宿主注入

## 使用示例

1. 启动 Agent Spaces 桌面 / Web 端
2. 在插件中心加载本插件（指向 `web-plugin.json`）
3. 启用后会在主界面看到一块「Web Client Plugin」卡片
4. 打开浏览器控制台可看到 `web test plugin activated`

## 常见问题

- **插件未加载**：CDN URL 是否可访问；网络是否能访问 GitHub raw。
- **激活失败**：检查 `web-client.js` 是否正确导出 `activate`；ESM 模式下需用 `export`。
- **视图不显示**：`web-plugin.json` 的 `hasView: true`，且 `view` 入口配置正确。
- **`context.storage` 报错**：只能在客户端插件使用；服务端插件没有 `storage`。

## 适用场景

- 客户端插件开发模板
- 演示如何把 Web 端能力封装为插件
- 远程分发 / 通过 CDN 更新的轻量插件
