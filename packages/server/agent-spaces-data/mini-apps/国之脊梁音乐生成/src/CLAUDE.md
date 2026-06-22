# 国之脊梁音乐生成

> 通过预设/上传参考音频 + 歌词/性别/风格参数，一键调用工作流生成致敬主题音乐。

## Project Overview

国之脊梁音乐生成是一个基于工作流的 AI 音乐翻唱生成 mini-app。用户可以选择硬编码的预设参考音频，或自行上传一段参考音频，配合歌词、性别、歌曲风格等参数，一键调用 Suno 翻唱工作流生成音乐。生成结果以音频卡片形式追加到右侧历史列表，并触发桌面通知与服务端通知中心。

## File Structure

- `index.jsx` — 入口组件，左栏表单（预设/上传切换、歌词、性别、风格、生成按钮）+ 右栏结果列表（音频播放、下载、删除、工作流切换）；含工作流调用、结果解析、草稿持久化、完成通知逻辑
- `services/store.js` — 服务端单一写入方：`add_results` / `remove_result` / `clear_results` / `save_shared_config`，结果落盘到 `configs/generation-history.json` 并广播 `miniApp.configChanged`

## Key Design Decisions

1. **调用工作流**：复用 `@agent-spaces/builtin` 内置工具 `execute_workflow_sync`（`callPluginTool`），传入 `workflow_id` + `input` + `max_wait_ms: 600000`。返回 `{ data: { status, steps } }`，从 `steps` 中找 `nodeId` 以 `_end` 结尾的结束节点，取 `output.result_url`（音频 URL 数组）。
2. **参考音频统一走 URL**：无论预设还是上传，均把可访问的 http URL 传给工作流的 `audio_url`，`is_custom_audio` 始终为 `false`（走工作流 default 分支，直接使用 URL，最可靠；与 cover-generator 同款）。
3. **上传**：`FileUpload autoUpload` 上传到 `/api/upload`，经 `resolveUploadItem` 取 `uploadedHttpPath`/`uploadedUrl` 作为 `audio_url`。
4. **预设自动填充**：选中预设参考音频时自动回填其 `gender` 与 `style`，用户可继续修改。
5. **结果解析容错**：`unwrapWorkflowPayload` 层层解包；`extractAudios` 优先取 end 节点 `result_url`，fallback 到 suno 节点 `sunoData[].audioUrl`（含 title/duration）。
6. **结果落库**：经 `invokeService('add_results', ...)` 在服务端原子去重写入 `configs/generation-history.json`，多端共享；UI 通过 `getConfig` + `onConfigChanged` 同步。
7. **草稿持久化**：表单字段（模式、预设索引、歌词、性别、风格）经 `getUserSetting/setUserSetting` 存入本地 localStorage（per-project，key `gjMusicDraft`），上传文件引用也持久化其已上传 URL 以便刷新后复用。
8. **完成通知**：成功后调用 `sendNotifiction`（桌面通知）+ `sendNotification`（服务端通知中心）；失败也弹桌面通知。两者均 try/catch 静默，权限被拒不影响主流程。
9. **工作流可切换**：默认 `c7e6ae77-f694-48b6-8d98-4040c2393b11`（国之脊梁音乐生成），可通过 `WorkflowListDialog` + `list_workflows` 切换其他工作流，选择持久化到 `configs/shared-config.json`。

## Dependencies

- **插件**: `@agent-spaces/builtin` — `execute_workflow_sync`（同步执行工作流）、`list_workflows`（列出可选工作流）
- **UI**: AgentSpacesUI（Button, Input, Label, Textarea, Select, FileUpload, Badge, WorkflowListDialog, Lucide 图标等）

## Notes

- 工作流 start 节点输入字段：`audio_url` `lyric` `is_custom_audio` `style` `gender`；end 节点输出 `result_url`（音频 URL 数组）。
- `lyric` 为必填（工作流 start 节点声明 required），UI 会前置校验。
- 音乐生成耗时约 90s+，`execute_workflow_sync` 的 `max_wait_ms` 设为 600000（10 分钟）兜底。
- 历史记录上限 100 条，按 url 去重。
