## 与 Mini-app 协同

Mini-app preview 通过宿主注入的 `window.AgentSpaces` 全局对象访问插件能力（`packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`）：

```js
const result = await window.AgentSpaces.callPluginTool(
  'workflow.minimax',
  'text_to_speech',
  { text: '你好' }
);
const audioUrl = result?.data?.url;
```

内置虚拟插件使用 `pluginId = '@agent-spaces/builtin'`；返回值通常包裹为 `{ success, message, data }`，业务侧读取 `data` 中的字段；带 `default` 的 schema 属性可省略参数；凭据由插件 config 自动注入，preview 代码不应收集或传递。

## 安全约束

- **沙箱执行** — 插件代码运行在 `vm.Script` 的 `runInNewContext` 隔离上下文中，`require` 被代理：Node 内置模块与相对/绝对路径走真实 `require`，外部 npm 包返回 Proxy stub（任意属性访问/调用都返回新的 Proxy，避免逃逸）。
- **凭据隔离** — AccessKey、SecretId 等敏感字段保存在插件 config（state.json），不进入 Workflow UI 表单，由后端在 `executePluginTool` 时合并进 `args`。
- **远程安装校验** — 远程清单 `id` 必须与请求 `pluginId` 一致；GitHub 目录安装跳过 `node_modules`；安装前会清空同名目标目录。
- **依赖隔离** — 插件依赖在各自目录内独立 `npm install`，registry / proxy 受 `npm-settings` 控制。

## 常见问题

### 节点要求「公网 URL」，但只有本地文件

很多三方生成 API（如阿里云扩图、视频编辑、数字人）只接受公网可访问的 `imageUrl` / `videoUrl` / `audioUrl`，不接受本地路径、`File`、base64 或内网 URL。正确数据流：`/api/upload` 落盘 → 调 OSS/COS 插件转存到公网 → 用对象存储公网 URL 调目标节点。

### 本地文件转公网 URL

如果插件节点要求传 `imageUrl` / `videoUrl` / `audioUrl`，推荐按下面的固定链路处理：

1. 在 Workflow UI 或 Mini-app 里先通过上传接口落盘，拿到服务端可读的 `path`。
2. 再调用 `workflow.aliyun-oss` 或 `workflow.tencent-cos` 之类的对象存储插件，把本地文件转成公网 URL。
3. 最后把这个公网 URL 传给目标生成插件。

不要直接把浏览器侧的 `File.path`、相对路径、base64 或 `/static/uploads/...` 相对地址当成目标插件输入。对外部三方 API 而言，最稳妥的输入始终是对象存储上的公网可访问 URL。

### 不要把浏览器 `File.path` 当成本地绝对路径

`File.path` 可能只是文件名，服务端按当前工作目录解析会出现 `ENOENT`。应使用 `/api/upload` 返回的 `path`，并命名保存为 `uploadedPath` 避免混淆。

### 提交按钮未禁用导致拿到空路径

文件上传是异步的，提交按钮必须在上传完成前禁用，否则生成工具可能拿到空路径、旧路径或相对路径。