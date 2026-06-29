# 贴图工坊 (stickerGenerator)

> 复刻自 StickerCraft 的贴图制作 mini-app。文生图 / 图生图走指定工作流，提示词生成走 `agent_run`。

## Project Overview

AI 贴图生成器：用户输入提示词 + 选择风格/比例/分辨率/布局/文字/背景，点击生成调用工作流产出贴纸图。
- **文生图**（无参考图）→ workflow `d88dcb7c-7f5f-47c8-962c-89217a2c0ad6` (text_to_image)，input `{prompt, model, aspect, size}`
- **图生图**（有参考图）→ workflow `19f5f8a9-305d-43a6-9b05-584597213a8f` (edit_image)，input `{images, prompt, model, aspect, size}`
- **提示词助手** → `agent_run`（先 `list_agent_presets` 取 preset，用默认 preset 生成英文贴纸提示词）
- 风格 / 文字 / 背景 / 布局 / 白边等可选项全部拼进 prompt 提交给工作流（见 `utils/styles.js#buildPrompt`）

## File Structure

- `index.jsx` — 入口，主布局 + 内联样式 + agent_run 提示词助手浮层
- `components/Header.jsx` — 顶栏（标题 + 计数）
- `components/ControlPanel.jsx` — 左侧控制面板（生成类型/提示词/风格/参考图/输出设置/高级选项/生成按钮）
- `components/StylePicker.jsx` — 风格选择（Popover 网格，内置 16 种 + 自定义）
- `components/Gallery.jsx` — 右侧图库（网格 + 空状态 + 清空）
- `components/StickerCard.jsx` — 单张贴图卡片
- `components/PreviewDialog.jsx` — 贴图预览大图弹窗
- `hooks/useConfigData.js` — configs 内存快照与变更订阅（历史/自定义风格/共享配置）
- `hooks/useGeneration.js` — 生成 + 任务事件订阅（miniApp.task*）
- `hooks/useAgentPresets.js` — 拉取 agent_run 可用 preset
- `utils/styles.js` — 风格/比例/分辨率/字体/背景/预设常量 + buildPrompt
- `utils/workflow.js` — 工作流 ID、调用入口、结果解析、上传项解析
- `services/store.js` — 服务端 configs 单一写入方（add_results/remove/clear/save_custom_style/save_shared_config）

## Key Design Decisions

1. **工作流能力受限**：两个工作流只接收 `{prompt, model, aspect, size[, images]}`，所以前端所有可选项（风格、文字、背景、布局、白边、面部）都通过 `buildPrompt` 拼成英文 prompt 字符串提交。
2. **文生图/图生图自动切换**：`runStickerWorkflow` 根据 `references` 是否为空自动选择对应工作流 ID。
3. **多端同步**：历史记录、自定义风格、共享配置全部走 `invokeService` + 服务端 `src/services/store.js` 单点写入，客户端只读 `getConfig` / `onConfigChanged`，避免并发覆盖。
4. **任务事件**：生成调用带 `{taskId, meta}`，通过 `onTaskEvent` 订阅 `miniApp.taskStarted/Finished/Failed` 同步 running 状态。
5. **agent_run**：提示词助手浮层用 `list_agent_presets` 取第一个可用 preset 调 `agent_run`，不依赖项目 `agents.json` 的内置对话（两者独立）。
6. **草稿持久化**：表单草稿走 `getUserSetting/saveUserSettings`（浏览器本地），参考图用 `persistableReferences` 序列化掉 File 对象。

## Dependencies

- 启用插件：`@agent-spaces/builtin`（提供 `execute_workflow_sync` / `list_agent_presets` / `agent_run`）
- 宿主组件：`window.AgentSpacesUI` 的 Button/Card/Select/Switch/Popover/Dialog/FileUpload/Badge 等
- 工作流：`text_to_image` (d88dcb7c...) 与 `edit_image` (19f5f8a9...)，需提前在 Workflow 编辑器里配置好

## Notes

- 两个工作流的结束节点 ID 为 `node_1782272191524_rvv1lk`（返回 `result: string[]`）和兜底 `node_1781681576137_end`（返回 error），`extractImages` 已兼容这两种与多种图片字段形态。
- 如需扩展更多风格，往 `utils/styles.js#STICKER_STYLES` 加即可，自定义风格通过 `invokeService('save_custom_style')` 存到 configs。
- `agent_run` 需要「设置 → Agent」里至少配置一个 preset，否则助手浮层会提示未找到。
