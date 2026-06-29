# 贴图工坊 (stickerGenerator)

> 复刻自 StickerCraft 的贴图制作 mini-app。文生图 / 图生图走指定工作流，提示词生成走 `agent_run`。

## Project Overview

AI 贴图生成器：用户输入提示词 + 选择风格/比例/分辨率/布局/文字/背景，点击生成调用工作流产出贴纸图。
- **文生图**（无参考图）→ workflow `d88dcb7c-7f5f-47c8-962c-89217a2c0ad6` (text_to_image)，input `{prompt, model, aspect, size}`
- **图生图**（有参考图）→ workflow `19f5f8a9-305d-43a6-9b05-584597213a8f` (edit_image)，input `{images, prompt, model, aspect, size}`
- **提示词助手** → `agent_run`（先 `list_agent_presets` 取 preset，用默认 preset 生成英文贴纸提示词）
- 风格 / 文字 / 背景 / 布局 / 白边等可选项全部拼进 prompt 提交给工作流（见 `utils/styles.js#buildPrompt`）

## File Structure

- `index.jsx` — 入口，主布局 + 内联样式 + agent_run 提示词助手浮层 + 设置/预览对话框编排
- `components/Header.jsx` — 顶栏（标题 + 计数 + 设置按钮）
- `components/SettingsDialog.jsx` — 设置对话框（文生图/图生图工作流选择 + 默认模型 + Agent 配置，参考文案转分镜 Dialogs）
- `components/ControlPanel.jsx` — 左侧控制面板（生成类型/提示词/风格/参考图/输出设置/高级选项/生成按钮）
- `components/PromptAgentPanel.jsx` — 提示词 AI 助手面板（内嵌在提示词输入框右下角）
- `components/StylePicker.jsx` — 风格选择（Popover 网格，内置 16 种 + 自定义创建/删除）
- `components/Gallery.jsx` — 右侧图库（网格 + 空状态 + 清空）
- `components/StickerCard.jsx` — 单张贴图卡片
- `components/PreviewDialog.jsx` — 贴图预览大图弹窗
- `hooks/useConfigData.js` — configs 内存快照与变更订阅（历史/自定义风格/设置），暴露 saveSettings
- `hooks/useGeneration.js` — 生成 + 任务事件订阅（miniApp.task*），从 settings 读取工作流 ID
- `hooks/usePromptAgent.js` — 提示词 AI 助手状态（agent_run 生成 + 结果/主题/open 状态）
- `hooks/useAgentPresets.js` — 拉取 agent_run 可用 preset（仅未配置 agent 时作兜底）
- `utils/styles.js` — 风格/比例/分辨率/字体/背景/预设常量 + buildPrompt
- `utils/settings.js` — DEFAULT_SETTINGS / MODEL_OPTIONS / WORKFLOW_SLOTS / AGENT 预设 / SETTING_KEYS
- `utils/workflow.js` — 工作流调用入口（ID 由参数传入）+ 结果解析 + 上传项解析
- `services/store.js` — 服务端 configs 单一写入方（add_results/remove/clear/save_custom_style/save_settings）

## Key Design Decisions

1. **工作流能力受限**：两个工作流只接收 `{prompt, model, aspect, size[, images]}`，所以前端所有可选项（风格、文字、背景、布局、白边、面部）都通过 `buildPrompt` 拼成英文 prompt 字符串提交。
2. **工作流 ID 可配置**：默认用用户提供的两个 ID，但 SettingsDialog 允许通过 `WorkflowListDialog` 重新选择，存到 `configs/settings.json`；`runStickerWorkflow` 接收 `workflowIds` 参数，缺省回退默认。
3. **文生图/图生图自动切换**：`runStickerWorkflow` 根据 `references` 是否为空自动选择对应工作流 ID。
4. **Agent 配置**：SettingsDialog 用宿主 `AS.openAgentEditor({initialName, initialPrompt, agentId})` 配置 agent，返回 `{id, name, modelProvider}` 后存 settings.json + localStorage 兜底；提示词助手优先用 settings.agentConfigId，否则用 `list_agent_presets` 兜底。
5. **提示词助手内嵌**：`usePromptAgent` 封装 agent_run 逻辑，`PromptAgentPanel` 内嵌在提示词输入框右下角（绝对定位触发按钮 + 展开面板），不再用全局 fab 浮层。
5. **多端同步**：历史记录、自定义风格、设置全部走 `invokeService` + 服务端 `src/services/store.js` 单点写入，客户端只读 `getConfig` / `onConfigChanged`，避免并发覆盖。
6. **任务事件**：生成调用带 `{taskId, meta}`，通过 `onTaskEvent` 订阅 `miniApp.taskStarted/Finished/Failed` 同步 running 状态。
7. **草稿持久化**：表单草稿走 `getUserSetting/saveUserSettings`（浏览器本地），参考图用 `persistableReferences` 序列化掉 File 对象。
8. **模型选择**：ControlPanel 模型字段改为下拉（MODEL_OPTIONS），选「自定义」时回退文本框；默认值来自 settings.defaultModel。

## Dependencies

- 启用插件：`@agent-spaces/builtin`（提供 `execute_workflow_sync` / `list_workflows` / `list_agent_presets` / `agent_run`）
- 宿主组件：`window.AgentSpacesUI` 的 Button/Card/Select/Switch/Popover/Dialog/FileUpload/Badge/WorkflowListDialog 等
- 宿主能力：`AS.openAgentEditor`（配置 agent）
- 工作流：默认 `text_to_image` (d88dcb7c...) 与 `edit_image` (19f5f8a9...)，可在设置里替换

## Notes

- 两个工作流的结束节点 ID 为 `node_1782272191524_rvv1lk`（返回 `result: string[]`）和兜底 `node_1781681576137_end`（返回 error），`extractImages` 已兼容这两种与多种图片字段形态。
- 如需扩展更多风格，往 `utils/styles.js#STICKER_STYLES` 加即可，自定义风格通过 `invokeService('save_custom_style')` 存到 configs。
- `agent_run` 需要「设置 → Agent」里至少配置一个 preset，否则助手浮层会提示未找到。
