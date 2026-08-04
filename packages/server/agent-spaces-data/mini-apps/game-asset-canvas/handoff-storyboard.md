# Handoff: game-asset-canvas 分镜创作节点

## 当前状态

已从 `mini-apps/文案转分镜` 移植分镜创作能力，且按最新反馈完成交互调整：

- `storyboard` 节点直接维护分镜列表，不使用项目管理或分镜编辑对话框。
- 节点顶部“AI 拆镜”按钮按需展开文案输入区。
- 分镜 Agent 在全局设置中通过 `openAgentEditor` 配置，字段为 `storyboardAgentConfigId/storyboardAgentName`。
- 节点顶部“角色库”按钮打开 Dialog；角色数据仍按工作区共享。
- 角色库“生图”按钮打开独立的“图片生成”Dialog，含“文生图 / 图生图”两个 Tabs；图生图可复用已记住的参考图或上传新参考图。
- 分镜卡片通过 `GripVertical` 手柄拖拽排序，落点后将 `index` 归一化为 `1..N`。
- 分镜生成图片/视频/音频后创建对应展示节点；展示节点可继续连线。
- 分镜的旁白、画面提示词、动画提示词三个输入框均有可见 label。
- 原内联“生成参数”已替换为“文生图 / 图生图 / 生成视频 / 生成配音”四个配置按钮；提交后参数保存在节点 `data.params` 的同名预设中。

## 关键入口

- 节点 UI：`src/components/nodes/StoryboardNode.jsx`
- 角色库 Dialog 内容：`src/components/right-panel/CharactersTab.jsx`
- Agent 设置：`src/components/SettingsDialog.jsx`、`src/utils/settings.js`
- 拆镜解析与排序：`src/utils/storyboard.js`
- 工作流执行与展示节点创建：`src/hooks/useStoryboardOperations.js`
- 生成参数 Dialog：`src/components/StoryboardGenerationDialog.jsx`
- 参数兼容与归一化：`src/utils/storyboard-generation.js`
- 工作区角色持久化：`src/hooks/useCharacterLibrary.js`、`src/services/canvas.js`
- 节点注册：`src/utils/constants.js`、`src/utils/canvas-constants.js`

完整架构、数据流与约束见 `src/handoff.md` 和 `src/CLAUDE.md`。本轮阶段记录见工作区根目录 `task_plan.md`、`findings.md`、`progress.md`。

## 数据约束

- 角色库：`configs/workspaces/<workspaceId>/storyboard-characters.json`。
- 分镜内容：节点 `data.scenes[]`；数组顺序是真值，`scene.index` 仅是归一化序号。
- 生成参数：节点 `data.params.textToImage/editImage/video/voice`；旧扁平参数仍由 `resolveStoryboardGenerationParams` 兼容读取。
- 分镜图片生成存在角色主参考图时调用图生图工作流及 `editImage` 预设，否则调用文生图工作流及 `textToImage` 预设；视频、配音分别使用 `video`、`voice` 预设。
- 角色的上次生图模式、两个图片预设和图生图参考图保存在角色对象 `generationParams` 中。
- Agent 配置：全局 `settings.json`，不要重新写回节点参数。
- AI 区域和角色 Dialog 的开关是组件临时 UI 状态，不进入持久化节点数据。
- 不要自动连接 storyboard 到生成的 display 节点；原因见 `src/handoff.md` 的“分镜创作节点”。

## 验证状态

最后一次验证通过：

- `node --test src/components/nodes/StoryboardNode.test.js src/utils/storyboard.test.js`
- Storyboard/角色组件 Babel JSX 转换通过。
- `git diff --check` 通过。

此前完整聚焦集为 29 个测试通过，覆盖 API、持久化、媒体派生、Agent 配置要求、AI 折叠入口和拖拽排序。

未运行真实浏览器或付费工作流。下一轮应手动确认 Dialog 尺寸、拖拽手感、Agent preset 保存以及真实拆镜输出。

## 工作区注意事项

当前工作区原本已有与本功能无关的修改，例如 mini-app `manifest.json`、`configs/panel-layout.json` 和 `mini-apps/index.json`。不要回退这些用户改动；提交前只选择本功能相关文件。

## Suggested Skills

- `write-mini-app-code`：继续修改该 mini-app 前必读，路径 `docs/skills/write-mini-app-code/SKILL.md`。
- `diagnose`：真实浏览器验证发现 Dialog、拖拽或工作流问题时使用。
- `handoff`：下一次跨会话继续交接时更新本文件或创建新的交接文件。
