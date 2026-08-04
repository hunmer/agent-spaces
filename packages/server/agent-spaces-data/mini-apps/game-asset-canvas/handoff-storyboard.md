# Handoff: game-asset-canvas 分镜创作节点

## 当前行为

- `storyboard` 节点直接编辑分镜，不包含源应用的项目管理或独立分镜编辑器。
- “AI 拆镜”按需展开文案输入；Agent 在全局设置中通过 `openAgentEditor` 配置。
- 工作区角色库由顶部按钮打开；角色“生图”使用文生图/图生图双 Tab Dialog，并记住角色级生成设置。
- 每张分镜通过 Avatar Group 展示当前角色；加号打开带头像、名称和 checkbox 的多选角色选择器。
- 顶部设置图标打开统一四 Tab Dialog，配置文生图、图生图、视频和配音参数。
- 分镜支持手柄拖拽排序；数组顺序是真值，排序后 `scene.index` 归一化为 `1..N`。
- 生成结果写入所属 `scene.images/videos/audios` 并在卡片内展示，不自动创建画布展示节点。
- 图片使用宿主 `Masonry` 三列瀑布流，按图片自然宽高比布局；点击打开全屏媒体预览。
- 左侧 sticky 分镜导航显示每镜首图，无图显示序号；点击平滑滚动到对应卡片。
- 右侧输出列表与分镜数量一一对应，并作为 `NodeShell` 外部的绝对定位兄弟节点渲染，避免被节点卡片裁剪；每项使用 `storyboard-scene:<sceneId>` source handle，显示首图/媒体类型和素材数，无素材时保留占位但禁止连接。
- 从分镜 handle 连线时，单素材直接使用；多素材先在 `ConnectionTargetDialog` 选择图片/视频/音频，再只显示与目标节点兼容的输入位置。

## 外置 Handle 结构约束

- 根因记录：Handle 曾被放在 `NodeShell` 的内容区内，受到卡片 `overflow-hidden` 和内容 `overflow-auto` 裁剪，视觉上位于节点内部且无法可靠拖拽。
- 最终 DOM 结构必须保持为：外层 `div.relative.overflow-visible` → `NodeShell` → `</NodeShell>` → 输出 `<aside>`。不要把输出 `<aside>` 重新放回 `NodeShell` children。
- 输出轨道固定使用 `position: absolute; left: calc(100% + 10px); top: 44px; width: 48px`，真实 React Flow `<Handle type="source">` 位于每个外置缩略项内。
- scene 增删、排序或素材数量变化后继续调用 `useUpdateNodeInternals(id)`；宿主 renderer 必须保留该 `@xyflow/react` 命名导出。
- 结构回归测试位于 `src/components/nodes/StoryboardNode.test.js`：`storyboard output handles live outside NodeShell overflow boundaries`。

## 数据与调用

- 角色库：`configs/workspaces/<workspaceId>/storyboard-characters.json`，写入统一走 `src/services/canvas.js`。
- 分镜：节点 `data.scenes[]`；角色关系为 `scene.characterIds`，素材为 `images/videos/audios`。
- 参数：`data.params.textToImage/editImage/video/voice`；旧扁平参数由 `resolveStoryboardGenerationParams` 兼容。
- 有角色主参考图时，图片生成使用 `editImageWorkflowId + params.editImage`；否则使用 `textToImageWorkflowId + params.textToImage`。
- 视频、配音分别使用 `videoGeneratorWorkflowId + params.video`、`textToVoiceWorkflowId + params.voice`。
- Agent 配置保存在全局 `settings.json`：`storyboardAgentConfigId/storyboardAgentName`，不要写入节点参数。
- AI 展开、Dialog 开关、Masonry 图片比例缓存和导航 ref 都是临时 UI 状态，不持久化。
- 选中的连线素材保存在 `edge.data.sourceAsset = { sceneId, type, url, thumb?, label? }`；下游只派生该素材，旧边仍按源节点整体输出兼容。

## 关键文件

- 节点 UI、Masonry、导航、角色选择：`src/components/nodes/StoryboardNode.jsx`
- 角色库：`src/components/right-panel/CharactersTab.jsx`
- 生成参数 Dialog：`src/components/StoryboardGenerationDialog.jsx`
- 工作流执行与 scene 写回：`src/hooks/useStoryboardOperations.js`
- 角色持久化：`src/hooks/useCharacterLibrary.js`、`src/services/canvas.js`
- 拆镜、排序：`src/utils/storyboard.js`
- 参数兼容：`src/utils/storyboard-generation.js`
- handle/素材规范化：`src/utils/storyboard-assets.js`
- 连接素材选择：`src/components/ConnectionTargetDialog.jsx`、`src/utils/connection-targets.js`
- 更完整架构：`src/handoff.md`、`src/CLAUDE.md`、`src/claude/data-model.md`

## 验证与注意事项

- 本轮聚焦集：34 个测试通过，包含外置 storyboard handle、素材规范化、目标过滤、媒体派生和边标签。
- mini-app 全量集 233/236 通过；剩余 3 项为工作区已有的 Spine 重绘/视频帧提取断言，与本轮文件无关。
- 相关 JSX/JS Babel 转换、宿主 renderer ESLint 和 `git diff --check` 通过；宿主全量 TypeScript 仍有其它模块的既有 API 类型错误。
- 未运行真实浏览器或付费生成工作流；需手动确认 Masonry 尺寸、左侧导航滚动、嵌套 Dialog 和真实工作流输出。
- 工作区存在其他未提交修改；不要回退或混入无关文件。
- 动态 handle 使用 `useUpdateNodeInternals`；宿主 `packages/web/src/components/mini-apps/react-renderer.tsx` 已补 allowlist，宿主进程需要重启后生效。
- 当前会话未提供 `procm-mcp`，因此没有直接终止或重启用户现有 web 进程。

## 下一步验收

1. 重启宿主 web 后刷新画布，确认输出缩略项完整位于 storyboard 节点右侧外部。
2. 在不同缩放级别从外置 Handle 拖到图片、视频、音频接收节点，确认能建立连线。
3. 对多素材分镜确认先选素材，再只显示兼容输入；完成连接后下游只收到 `edge.data.sourceAsset.url`。
4. 新增、删除、排序分镜后确认 Handle 数量、顺序和连线命中位置同步更新。

## Suggested Skills

- `write-mini-app-code`：继续修改前阅读 `docs/skills/write-mini-app-code/SKILL.md`。
- `diagnose`：真实浏览器或工作流出现问题时使用。
- `handoff`：下一次交接时继续更新本文件。
