# 文案转分镜

> 多项目管理 · 角色/分镜管理 · 调用工作流生成分镜图片与视频 · 文案经 Agent 一键导入

## Project Overview

「分镜生成素材」mini-app。围绕「项目 → 角色 + 分镜」两层结构组织视频分镜素材：

- **项目管理**：新建 / 切换 / 重命名 / 删除多个项目，数据隔离。
- **角色管理**：每个角色含 名称、提示词、图片列表（其中一张为「选中图」）。
- **分镜管理**：每个分镜含 index、旁白文本、画面提示词、动画提示词、参与角色；可调用工作流生成图片与视频并回填预览。
- **文案导入**：输入一段设定，调用「文案到分镜」Agent 输出标准分镜 JSON（角色列表 + 场景列表）并导入。

## File Structure

- `index.jsx` — 入口：顶部工具栏（项目切换/新建/重命名/删除 + 导入文案/设置/配置 AI）+ Tab（角色/分镜）+ Style 样式
- `hooks/useStore.js` — 数据编排 Hook：封装 service 调用 + `configs/data.json` 订阅，对外暴露当前项目与 actions
- `services/store.js` — 服务端单一写入方：项目/角色/分镜/媒体/设置/导入等 handler，全部走 `ctx.updateConfig` 原子写
- `utils/constants.js` — 工作流 ID、提供商/模型/比例/尺寸选项、默认设置、Agent 预设提示词、`uid`、空项目骨架
- `utils/workflow.js` — `execute_workflow_sync` 调用、结果解包解析、`resolveUploadItem`、`parseStoryboardJson`
- `components/CharacterPanel.jsx` — 角色列表 + 编辑（autosave）+ 图片上传 + 选中图单选
- `components/ScenePanel.jsx` — 分镜卡片列表 + 每卡生图/生视频按钮 + 媒体回填预览（autosave）
- `components/Dialogs.jsx` — `ImportDialog`（文案导入）/ `SettingsDialog`（生成设置）/ `AgentConfigButton`（openAgentEditor）

## Key Design Decisions

1. **单一数据文件**：所有项目数据存 `configs/data.json`（`{ version, activeProjectId, projects[], settings }`），service 为唯一写入方，`getConfig` + `onConfigChanged` 多端同步。
2. **调用工作流**：复用 `@agent-spaces/builtin` 的 `execute_workflow_sync`，传 `workflow_id + input + max_wait_ms:600000`，`{ taskId, meta }` 跟踪任务。结果从 end 节点 `output.result`（string[]）提取 URL。
3. **两个工作流**：图片 `19f5f8a9-...`、视频 `5130958f-...`；输入字段一致：`images[]`（参考图 URL）、`prompt`、`provider`（keling/qwen）、`model`、`aspect`、`size`。
4. **生图参考图**：取分镜「参与角色」的「选中图」URL 列表作为 `images`，并把角色 prompt 拼到画面提示词前。
5. **生视频首帧**：优先用本镜已生成图片（最后一张），否则退回角色选中图。
6. **Agent 导入**：podcast 同款 `openAgentEditor`（预设「文案到分镜」name+prompt）配置 agent，`agent_run` 输出 JSON，`parseStoryboardJson` 容错解析（去 ```json 围栏 + 截取首尾大括号），`import_storyboard` 落库（merge 同 index 覆盖 / replace 清空）。
7. **角色名→ID 映射**：Agent 输出的 `characterNames` 在 service `import_storyboard` 内（角色导入后）映射为 `characterIds`。
8. **autosave**：角色/分镜编辑用 debounce（500ms）自动保存；与 store 深比较一致时跳过，避免循环。
9. **选中图单选**：角色图片 `selected` 字段，`select_character_image` 切换时保证单张选中。

## Dependencies

- **插件**：`@agent-spaces/builtin` — `execute_workflow_sync`、`agent_run`、`openAgentEditor`、`list_workflows`
- **UI**：AgentSpacesUI（Button、Input、Label、Textarea、Select、FileUpload、Badge、Lucide 图标等）

## Notes

- 首次打开若无 `data.json`，`ensure_data` 会写入默认结构。
- `agentConfigId` / `agentMeta` 存 localStorage（per-project，key `sb_agentConfigId` / `sb_agentMeta`）。
- 工作流实际能力取决于其内部节点配置（provider=keling 走可灵图像生成，provider=qwen 走 AI 图像编辑）。
