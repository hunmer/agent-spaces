# copywriting

> 文案库（Workflow UI 插件）。本项目在 workflow-ui 渲染器沙箱内运行。

## Project Overview

文案库：支持音频 / 视频 / 文本三种文案。音视频通过阿里云 ASR 自动转写为文字，瀑布流展示 + 侧边栏筛选，数据存 SQLite。

- **文本**：手动输入标题 + 内容
- **音视频**：FileUpload 上传 → 云存储转公网（阿里云 OSS / 腾讯云 COS 可切换）→ `asr_file_recognition` 转写 → 落库
- **存储方案**：右上角齿轮设置，切换阿里云 OSS / 腾讯云 COS，存 `configs/upload-settings.json`，默认阿里云
- **转写状态**：`status` 字段（transcribing / done / failed），靠 DB 驱动卡片态
- **跨标签同步**：`onTaskEvent`（taskFinished / taskFailed → 刷新本端视图）

设计详见仓库 `docs/superpowers/specs/2026-06-12-copywriting-library-design.md`。

## File Structure

- `index.jsx` — 入口：布局（瀑布流 + 侧边栏）、编排（新建 / 编辑 / 删除 / 重试 / 播放）、存储设置态、任务事件订阅
- `components/Toolbar.jsx` — 标题 / 计数 / 新建按钮 / 存储设置齿轮
- `components/CopywritingCard.jsx` — 瀑布流卡片（含转写中 / 失败态、播放、重试）
- `components/FilterSidebar.jsx` — 关键词 / 类型 / 标签 / 时长排序
- `components/CopywritingForm.jsx` — 新建 + 编辑弹窗（FileUpload 上传、类型切换、标签）
- `components/PlayerDialog.jsx` — 音视频播放弹窗
- `components/UploadSettingsDialog.jsx` — 云存储方案切换（阿里云 OSS / 腾讯云 COS）
- `hooks/useCopywritingDb.js` — SQLite CRUD + 过滤
- `hooks/useSettings.js` — 上次筛选偏好（JSON config）
- `utils/db.js` — `db('copywriting')` + `initSchema`
- `utils/settings.js` — 筛选偏好 readConfigJson / writeConfigJson
- `utils/upload.js` — 云存储转存 `uploadToCloud(filePath, provider)` + `readUploadSettings`（阿里云 OSS / 腾讯云 COS）
- `utils/transcribe.js` — ASR `recognize` + 时长提取 + taskId（上传职责已收敛给 FileUpload / upload.js）

## Key Design Decisions

- **状态靠 DB 驱动**：卡片转写态直接读 `status` 字段；发起方 `await` 落库 + 自刷新，非发起方靠 `onTaskEvent` 刷新。
- **ASR 后台化**：表单只等「上传 + 云转存 + INSERT」即关闭；转写 fire-and-forget，完成后落库刷新。
- **config 注入**：`callPluginTool` 不传 apiKey / baseUrl / 云凭据，平台 `getPluginConfig` 自动注入。
- **云存储可切换**：`uploadToCloud` 按 `upload-settings.json` 的 provider 分发；腾讯云 `cos_upload_file` 不存在时 fallback `cos_upload`。
- **重试复用 oss_url**：失败重试只重新发起 ASR（DB 字段 `oss_url` 实际存「转写用公网 URL」，OSS / COS 通用），不重复上传。

## Dependencies

- 宿主：`window.AgentSpacesUI`（shadcn 组件 + lucide 图标 + `FileUpload`）、`window.AgentSpaces`（`callPluginTool` / `uploadFile` / `db` / `onTaskEvent`）
- 插件 `workflow.aliyun-ai`：`asr_file_recognition`（需平台配置 DashScope `apiKey`）
- 云存储二选一（按存储设置）：
  - `workflow.aliyun-oss`：`oss_upload_file`（默认）
  - `workflow.tencent-cos`：`cos_upload_file` / `cos_upload`
  - 两者均需 bucket 对象公网可读，供 DashScope 拉取

## Notes

- 上传文件落盘到 server 本机 `/api/upload`，云存储插件须与 server 同机执行（`path` 仅本机可读）。
- 转写期间关闭 / 刷新发起标签：该条会停在 `transcribing`，可删除重建（边界，未自动恢复）。
- 文案正文取值：`type === 'text' ? content : transcription`。
- 关键词搜索为即时（每次输入触发一次 SQLite REST 查询，本地库小，可接受）。
