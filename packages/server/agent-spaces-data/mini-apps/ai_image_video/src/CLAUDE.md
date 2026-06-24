# AI创作

> This file is auto-generated. Keep it up-to-date as the project evolves.

## Project Overview

AI 绘图创作工具，支持七种模式：文生图、图生图、图片编辑、图生视频、扩图、视频编辑、数字人。左侧为表单面板，右侧为结果分组平铺展示（含图片/视频懒加载）。支持 MiniMax、即梦(Jimeng)、阿里云、OpenAI 四个提供商；需要公网 URL 的阿里云模式会先把本地文件转存到 OSS/COS。

## File Structure

- `index.jsx` — 入口文件，ResizablePanelGroup 左右布局；持有 preset 联动状态（右侧卡片二次创作 → 左侧预填）；监听 agent 广播事件（switchMode/setForm/triggerGenerate/useAsSource/deleteResult/clearHistory）并通过 LeftPanel 的 imperative API（onReady 暴露）或 useGeneration 方法执行
- `agents.json` — agent 配置（与 manifest.json 同步），定义创作管家 agent，引用全局 preset 借密钥
- `src/api.js` — agent 可调用的项目 API：get_generation_history / get_capabilities / switch_mode / set_form / trigger_generate / use_as_source / delete_result / clear_history
- `src/tools.js` — api.js 中带参方法的结构化参数说明（agent 据此知道传什么）
- `components/LeftPanel.jsx` — 左侧表单：模式选择(Tabs 7个标签，固定顶部)、提供商选择(Select)、模型选择(Select)、图片/视频/音频上传(FileUpload)、扩图/视频编辑/数字人动态表单字段、错误提示+生成按钮(固定底部)。按钮始终显示正常状态，旁边有队列图标（DropdownMenu 展示任务详情）；接收 preset 应用二次创作预设（切模式+预填远程 URL 源，不触发本地落盘/云转存）；通过 onReady prop 暴露 imperative API（switchMode/applyFormPatch/submit），供 agent 广播事件调用；submitRef 在每次渲染同步最新 handleGenerate 闭包，避免 agent trigger_generate 拿到陈旧 state
- `components/RightPanel.jsx` — 右侧结果展示：上传设置入口、单张图片骨架占位、按日期+模式+提供商分组平铺（最新在前，已取消折叠）、分组头部展示指令文本、Flex 瀑布流布局、IntersectionObserver 媒体懒加载、MediaGallery 灯箱预览、空状态；卡片底部三点菜单（下载/重新生成/图生图/扩图/图生视频/图片编辑(图)/视频编辑(视)），图片贴卡片顶部
- `components/UploadSettingsDialog.jsx` — 上传设置弹窗：选择腾讯云 COS / 阿里云 OSS，并控制提交时是否自动转存本地文件
- `hooks/useUI.js` — 安全访问 `window.AgentSpacesUI` 的 Hook（轮询等待异步注入完成）
- `hooks/useGeneration.js` — 生成逻辑：任务队列管理(taskQueue)、调用插件工具、管理结果数组、异步视频轮询。loading/progress 从 taskQueue 派生，支持并发提交，已完成/失败任务自动清理
- `utils/providers.js` — 提供商配置、模型选项(MODEL_OPTIONS)、模式/工具映射、参数构建、结果解析
- `utils/upload.js` — 云存储转存工具：读取 `upload-settings.json`，调用 `workflow.aliyun-oss` / `workflow.tencent-cos` 上传本地 path 并返回公网 URL

## Key Design Decisions

- **useUI Hook**: 所有组件通过 `useUI()` Hook 访问 `window.AgentSpacesUI`，而不是直接解构全局对象。UI 组件在渲染器中是异步注入的，直接解构可能导致 `Cannot read properties of undefined` 错误
- **FileUpload 上传开关**: host `FileUpload` 支持 `autoUpload` 开关。当前项目显式传 `autoUpload={false}`，选择文件时只进入表单状态，不立即落盘
- **提交时落盘**: 左侧提交时调用 `window.AgentSpacesUI.uploadFile(file)` POST `/api/upload`，并把返回值写到 `uploadedPath/uploadedUrl/uploadedHttpPath`。提交上传完成前生成按钮禁用；业务侧只使用 `uploadedPath` 或绝对路径，避免把浏览器 `File.path` 的相对文件名传给云存储插件
- **公网 URL 转存**: 扩图、视频编辑、数字人等需要公网 URL 的模式在 `useGeneration` 中调用 `uploadToCloud`，把本地 `imagePath/videoPath/audioPath/referenceImagePaths` 转成 OSS/COS URL 后再构建阿里云工具参数。凭据由插件配置注入，前端不收集密钥
- **分组平铺展示**: 结果按日期+模式+提供商自动分组，分组头部（日期 + 模式/提供商 Badge + 数量）与内容直接平铺渲染，已取消 Accordion 折叠交互。最新分组在前
- **分组指令展示**: `groupResults` 为每个分组收集去重后的 `prompt`（指令）。分组头部第二行展示指令文本（单行省略）；同组含多个不同指令时显示首个并标注 `+N`，`title` 悬停可查看全部指令
- **媒体懒加载**: `MediaCard` 通过 `IntersectionObserver`（`rootMargin: 300px`）控制真实 `src` 挂载——图片/视频进入视口预加载区前只渲染 `Skeleton` 骨架占位，避免大量历史结果一次性请求资源。`<img>` 同时保留原生 `loading="lazy"` 双保险
- **MediaGallery 灯箱**: 点击卡片图片调用 `window.AgentSpacesUI.openMediaGallery(items, startIndex)` 打开全屏灯箱预览，支持缩放、视频播放、缩略图导航
- **卡片三点菜单与二次创作联动**: MediaCard 移除悬浮下载/删除按钮，改为底部 `⋮` 三点 DropdownMenu。菜单项点击（图生图/扩图/图生视频/图片编辑(仅图)/视频编辑(仅视)/重新生成）通过 `onUseAsSource(item, mode)` 上抛到 App，App 写入 `preset`（带递增 seq）传给 LeftPanel；LeftPanel 在 useEffect 中应用：切目标模式、联动 provider/model（优先沿用生成该媒体的提供商）、回填 prompt、用 `makeRemoteFile(url)` 预填 FileUpload。预填的远程 URL 对象非 File 实例且无 uploadedPath，提交时 `resolveFileUrl` 直接返回公网 URL，不触发本地落盘或云存储转存。`useRef` 记录上次 seq 防重复应用
- **卡片图片贴顶**: host Card 默认带 `py-4` 内边距且 `has-[>img:first-child]:pt-0` 对 CardContent 首子不生效，故给 mediaCard 显式 `padding: 0` 让图片紧贴卡片顶部
- **瀑布流布局**: 资源使用 CSS Columns（`column-count: 2`）实现瀑布流布局，图片以原始比例展示（无 `aspect-ratio` 裁剪），卡片高度自适应
- **凭据持久化**: 通过 `window.AgentSpacesUI.writeConfigJson/readConfigJson` 保存 API Key / Session ID
- **结果持久化**: 生成结果通过 `writeConfigJson('generation-history.json')` 自动保存，页面重载后通过 `readConfigJson` 恢复历史记录
- **视频生成**: MiniMax 视频生成节点内部自动轮询至完成，直接返回 `downloadUrl`
- **结果解析**: `extractMediaUrls` 兼容多种返回格式（直接 URL / 嵌套对象 / 数组 / OpenAI data 数组）
- **文件上传**: 使用 `window.AgentSpacesUI.FileUpload` 组件替代手动 URL 输入，支持拖拽/点击上传本地图片、视频、音频。host 会先落盘，普通模式可回退 data URL，需要公网 URL 的模式会自动转存云存储。图生视频/扩图模式限 1 张，图生图模式限 4 张，视频编辑参考图限 4 张，数字人需要 1 个视频 + 1 个音频
- **ResizablePanel 尺寸**: 使用百分比字符串 `"32%"` 而非数字 `32`（数字被解释为 px）
- **提供商-模式联动**: 选择提供商时自动切换到该提供商支持的模式；切换模式时自动选择可用提供商。解决了 minimax 在非 image_to_video 模式下无法选择的问题
- **模型选择**: 每个提供商×模式组合有不同的模型可选（`MODEL_OPTIONS` 映射），切换提供商/模式时自动重置为默认模型。`getModelOptions` 和 `getDefaultModel` 提供查询能力
- **左侧栏固定布局**: Tabs 固定顶部，错误提示+生成按钮固定底部（`flexShrink: 0`），仅中间表单区域使用 `ScrollArea` 滚动。外层 div 设置 `overflow: hidden` 防止溢出
- **并发提交**: 提交按钮始终为正常状态（无 loading 变化），`canGenerate` 不包含 `!loading` 条件，用户可连续发起多个生成任务
- **任务队列**: `useGeneration` 维护 `taskQueue` 数组追踪并发任务，每个任务有独立状态（running/completed/failed）。`loading` 和 `progress` 从 taskQueue 派生。已完成/失败任务 3 秒后自动清理
- **队列图标**: 生成按钮旁显示运行任务计数徽标（红色角标），点击展开 DropdownMenu 查看每个任务的模式、提供商、进度/错误信息
- **单张骨架占位**: 加载中时右侧仅显示一张居中图片骨架占位，替代之前的多卡片网格

## Dependencies

- AgentSpacesUI 组件库（Accordion, Card, Badge, Button, ScrollArea, Empty, openMediaGallery 等）
- 插件: `workflow.minimax`, `workflow.jimeng`, `workflow.aliyun-ai`, `workflow.openai`, `workflow.aliyun-oss`, `workflow.tencent-cos`

## Notes

- OpenAI 提供商支持文生图（`openai_create_image`）、图生图（`openai_edit_image`）和图片编辑（`openai_edit_image`），支持质量/输出格式/数量参数
- 图片编辑模式：调用 `aliyun_image_edit`（阿里云）或 `openai_edit_image`（OpenAI），支持风格迁移、物体增删、局部修改等编辑操作。阿里云支持 1-9 张图片输入，OpenAI 支持最多 4 张
- MiniMax 仅支持图生视频模式，选择 MiniMax 时会自动切换到图生视频模式
- 图生图模式支持多图上传（最多 4 张），图片编辑模式根据提供商不同限制（阿里云 9 张、OpenAI 4 张），图生视频/扩图模式限 1 张。视频编辑模式上传 1 个视频和可选参考图，数字人模式上传 1 个视频和 1 个音频
- 运行端到端扩图/视频编辑/数字人前，需要在插件配置中完成 `workflow.aliyun-ai`、`workflow.aliyun-oss` 或 `workflow.tencent-cos` 的密钥配置，并确保 OSS/COS 对象可被阿里云生成服务公网访问

## Agent 集成

预览 Toolbar 自包含版 agent（参考 [docs/mini-app-preview-agent.md](../../../../../docs/mini-app-preview-agent.md)）。`manifest.json` 中 `enableAgents: true` + `agents.json` 定义创作管家 agent；`agentId` 引用全局 preset 借用 API Key，本地下发 `systemPrompt` 限定 agent 只能用项目 API 操作 UI，禁止直接 `execute_plugin_tool` 调生成类插件。

### 设计原则：与任务驱动模型对齐

agent **不直接调用插件生成**，而是通过 broadcast 指挥前端走完整的 `callPluginTool → 任务队列 → 自动落库 → 多端同步` 流程。这样：
- 复用 useGeneration 已有的 buildToolCall 逻辑，避免在 api.js 中重复维护一份提供商/模式映射
- UI 完整反映生成过程（任务进度、错误提示、历史记录）
- agent 通过 `get_generation_history` 拿最终结果

### 广播事件协议

| 事件 | 方向 | data | 处理 |
| --- | --- | --- | --- |
| `miniApp.switchMode` | server → client | `{ mode }` | `leftPanelApi.switchMode(mode)` |
| `miniApp.setForm` | server → client | `{ 字段名: 值, ... }` | `leftPanelApi.applyFormPatch(patch)` |
| `miniApp.triggerGenerate` | server → client | `{}` | `setTimeout(() => leftPanelApi.submit(), 0)`（等 setState 应用） |
| `miniApp.useAsSource` | server → client | `{ mode, source: { type, url, prompt?, provider? } }` | `setPreset({ kind: 'useAsSource', ... })` |
| `miniApp.deleteResult` | server → client | `{ id }` | `removeResult(id)` |
| `miniApp.clearHistory` | server → client | `{}` | `clearResults()` |

### LeftPanel imperative API

通过 `onReady` prop 在 mount 时回调，传 `{ switchMode, applyFormPatch, submit }`。内部用 `switchModeRef / applyFormPatchRef / submitRef` 包装最新闭包，`onReady` 只触发一次避免频繁 re-render，调用时拿到最新 state。

`submitRef.current = handleGenerate` 在每次渲染直接赋值（不在 useEffect 中），保证 `submit` 总能拿到最新表单状态。

### 典型 agent 流程

- **文生图**：`switch_mode('text_to_image')` → `set_form({ prompt, provider, model })` → `trigger_generate()`
- **改图**：`get_generation_history` 找候选 → `use_as_source({ mode: 'image_edit', sourceId })` → `set_form({ prompt })` → `trigger_generate()`
- **图生视频**：`get_generation_history` 找候选 → `use_as_source({ mode: 'image_to_video', sourceId })` → `set_form({ prompt, provider: 'minimax' })` → `trigger_generate()`

### 边界

- agent toolcall 之间有 LLM 推理间隔，客户端有时间渲染；`trigger_generate` 用 `setTimeout(0)` 防御性等 setState 应用
- `applyFormPatch` 中 `provider` 字段切换会自动重置 model（与 UI 行为一致）
- `use_as_source` 校验源类型与目标模式匹配（图→图模式，视频→视频模式）
- `get_generation_history` 按时间倒序返回，items[].id 可作为 `use_as_source` 的 sourceId
