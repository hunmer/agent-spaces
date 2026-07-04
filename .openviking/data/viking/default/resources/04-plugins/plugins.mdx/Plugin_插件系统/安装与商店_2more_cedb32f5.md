## 安装与商店

### 从内置模板安装

`installTemplatePlugin(pluginId, sourceUrl?, md5?)`（`plugin.ts:922`）是统一入口。当不带 `sourceUrl` 时，从 `packages/templates/plugins/` 找到对应目录，复制（排除 `node_modules`）到数据目录，并按需运行 `npm install` 安装 `package.json` 声明的依赖（受 `npm-settings` 控制 registry / proxy）。安装完成后自动启用并记录 `md5` / `installedAt`。

### 从远程商店安装

带 `sourceUrl` 时按以下顺序尝试（`installStorePlugin`，`plugin.ts:907`）：

1. **GitHub 目录安装**（`tryInstallGithubStoreDir`）— 当 URL 匹配 `raw.githubusercontent.com/<owner>/<repo>/<ref>/<dir>` 或 `github.com/<owner>/<repo>/raw/refs/heads/<ref>/<dir>` 时，调用 GitHub Contents API 递归拉取目录下所有文件（跳过 `node_modules`），写入数据目录。
2. **ZIP 安装**（`tryInstallStoreZip`）— 在 URL 后追加 `.zip` 下载并解压（支持嵌套单层目录展平）。
3. **公共文件安装**（`tryInstallStoreCommonFiles`）— 按清单候选名依次尝试拉取 `info.json` / `manifest.json` 等，再补拉一组约定文件（`main.js` / `workflow.js` / `tools.js` / `actions.js` / `lang.json` / `shared.js` / 图标 / `entries` 中声明的入口）。

三种策略都要求远程清单 `id` 与请求 `pluginId` 一致，否则抛出 id mismatch 错误。

### 依赖安装

`installPluginDependencies(dir)` 在插件目录含 `package.json` 且无 `node_modules` 时，按 `npm-settings` 配置的 registry / proxy 同步运行 `npm install --omit=dev`（`plugin.ts:178`）。安装失败会抛错并阻止插件启用。

## 内置插件清单

仓库 `packages/templates/plugins/` 当前内置约 19 个插件（`index.json` 中登记 19 条），按能力域分组：

**AI 生成**

- `workflow.aliyun-ai` — 阿里云百炼 AI（千问文生图、万相视频生成/编辑、可灵生图、图像扩图、声动人像、ASR 语音识别）
- `workflow.minimax` — MiniMax 多模态（文本合成、角色对话 M2-her、TTS、音乐生成、视频生成、歌词生成）
- `workflow.openai` — OpenAI 集成（文生图、图片编辑、Chat Completions、Embeddings、Audio TTS/STT）
- `workflow.jimeng` — 即梦 AI（文生图、图生图、文生视频）
- `workflow.fish-audio` — FishAudio 语音合成与识别（TTS / STT）
- `workflow.qianyin` — 千音 TTS 语音合成

**云存储**

- `workflow.aliyun-oss` — 阿里云 OSS（上传/下载/删除/列举/签名 URL）
- `workflow.tencent-cos` — 腾讯云 COS（同上）

**通知与通信**

- `workflow.dingtalk` — 钉钉自定义机器人 Webhook（text/markdown/link/actionCard/feedCard）
- `workflow.mail` — SMTP 邮件发送（HTML/纯文本、附件、抄送/密送）

**音视频与文件处理**

- `workflow.ffmpeg` — FFmpeg 音视频处理（格式转换、合并、分离）
- `workflow.epub-parser` — EPUB 电子书解析（书籍信息、目录、章节）
- `workflow.file-system` — 文件系统操作（读写、编辑、枚举、删除、目录管理）
- `workflow.fetch` — 网络请求（网页抓取、文件下载、批量下载）

**SDK 与集成**

- `workflow.mira-sdk` — Mira App Server SDK（素材库管理、文件上传下载、设备通信、系统监控）

**桌面与窗口（client 类型）**

- `workflow.desktop-native` — 桌面原生能力（剪贴板读写、系统通知）
- `workflow.window-manager` — 浏览器窗口管理（创建、导航、关闭、截图）

**示例与测试**

- `workflow.custom-view-demo` — 演示 Workflow 节点如何用 React/HTML `customView` 渲染节点界面
- `workflow.test-plugin` — Web client 插件示例（`hasView: true`，通过 CDN 加载 runtime 与 view）

每个插件的 `actions.js` 中实际可用的工具/节点数远多于上面列出的能力描述（例如 `aliyun-ai` 的 `actions.js` 单文件就含数十个 action）。