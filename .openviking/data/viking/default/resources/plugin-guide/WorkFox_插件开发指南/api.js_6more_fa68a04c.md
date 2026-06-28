## `api.js`

只有当你需要扩展默认 API 时再写。

```javascript
module.exports = {
  createApi: ({ windowManager }) => ({
    createManagedWindow(options) {
      return windowManager.createWindow(options)
    },
  }),
}
```

典型用途：

- Electron client 插件暴露窗口能力
- 对 handler 注入宿主侧附加服务

## `view.js`

当前设置面板通过字符串方式加载 `view.js`。

最简单写法：

```javascript
module.exports = {
  template: `
    <div class="text-sm">
      Hello plugin view
    </div>
  `,
}
```

注意：

- Electron 本地插件：`view.js` 从本地目录读取
- Web CDN client 插件：`view.js` 从 manifest 指向的 URL 拉取
- 当前实现对 `view.js` 的执行方式比较轻量，复杂依赖不建议直接塞进这里

## Web Client 插件 Manifest

Web client 插件需要单独 manifest。

示例：

```json
{
  "id": "workfox.test-plugin",
  "name": "Test Plugin",
  "version": "1.0.0",
  "description": "Web client plugin",
  "author": { "name": "workfox" },
  "type": "client",
  "runtimeTargets": ["web", "electron"],
  "iconUrl": "https://example.com/icon.png",
  "entries": {
    "client": {
      "url": "https://example.com/web-client.js",
      "format": "esm"
    },
    "view": {
      "url": "https://example.com/view.js",
      "format": "cjs"
    }
  }
}
```

当前要求：

- `entries.client.url` 可被浏览器 `import()`
- `entries.view.url` 当前按文本拉取

## 配置系统

在 `info.json` 中声明：

```json
{
  "config": [
    {
      "key": "apiKey",
      "label": "API Key",
      "type": "string",
      "value": "",
      "required": true
    }
  ]
}
```

读取方式：

- `context.config.apiKey`
- workflow 运行时也会把插件配置加载到 `__config__`

## 当前推荐实践

1. 能做成 `server` 的不要做成 `client`
2. 依赖 Electron API 的插件必须是 `client`
3. 非必要不要继续新增 `both`
4. Web client 插件必须提供 `manifestUrl`
5. 插件商店条目必须写清：
   - `type`
   - `runtimeTargets`
   - `manifestUrl`（如果是 Web client）

## 当前仓库里的参考实现

### Server 插件参考

- `resources/plugins/jimeng`
- `resources/plugins/fetch`
- `resources/plugins/file-system`
- `resources/plugins/fish-audio`

### Electron Client 插件参考

- `resources/plugins/window-manager`

### Web Client Manifest 参考

- `resources/plugins/test-plugin/web-plugin.json`
- `resources/plugins/test-plugin/web-client.js`
- `resources/plugins/test-plugin/view.js`