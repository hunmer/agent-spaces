# 独立 SAM 插件调研发现

## 已确认服务契约
- 服务目录：`G:/spine-animation-ai-workspace/spine-animation-ai/reskin-app/sam_server`。
- 健康检查：`GET /health`。
- 分割接口：`POST /segment_with_boxes`。
- 请求：`{ image_base64, boxes: [{ slot_id, x_min, y_min, x_max, y_max }] }`。
- 响应：`{ masks: [{ slot_id, score, mask_b64 }] }`。
- 参考客户端：`reskin-app/app/backend/ai/sam_provider.py`。
- 参考实现明确说明：整图 embedding 只计算一次，然后批量处理 boxes。

## 当前 game-asset-canvas 状态
- `reskinPipeline.js` 的 SAM 分支目前通过 `workflow.rembg/rembg_sam_segment` 逐 region 调用。
- 当前 helper `samBoxPrompt()` 和 rembg prompt schema 都应由新插件契约替换，不应继续修补 rembg。
- `bg_components` 分支仍依赖 `workflow.rembg/rembg_remove`，因此 manifest 暂时仍需保留 `workflow.rembg`。

## 插件输出设计
- 不把 `mask_b64` 直接返回 mini-app；插件将每个 mask 保存为公共 PNG，返回 `maskUrl`。
- 推荐 action 输出：`{ success, message, data: { masks: [{ slotId, score, maskUrl }], total } }`。
- 原服务输出 PNG 是灰度 mask，不含生成图 RGB。mini-app 必须使用生成图 RGB，并仅将 mask 灰度写入 alpha。
- 原服务当前未运行：`GET http://127.0.0.1:30231/health` 被拒绝连接。

## 新插件文件与注册
- 实际插件目录：`packages/server/agent-spaces-data/plugins/sam/`。
- 商店模板目录：`packages/templates/plugins/sam/`。
- 商店索引生成命令：`node packages/templates/generate-index.mjs`。
- mini-app 严格 allowlist：`manifest.json.enabledPlugins` 必须增加 `workflow.sam`。
- `plugin-guide.md` 推荐 server 插件通过 `main.js` 调用 `context.registerActions(actions)`；`workflow.js`、`tools.js` 保留空兼容入口。
- 现有 rembg 插件已经提供 URL/data URI/本地路径转 Buffer 与 `ctx.api.savePublicFile` 的成熟模式，可在独立 SAM 插件中最小化复用其结构，但不能复用 rembg SAM action。
- Python `sam_server.py` 默认端口为 30231，`POST /segment_with_boxes` 在一次 `set_image` 后循环全部 boxes；错误体字段为 `error`，插件错误解析需保留该字段。
- 可用的 `plugin-creator` 技能专用于 Codex `.codex-plugin/plugin.json`，与本仓库 Agent Spaces `info.json` 插件格式不兼容；不运行其脚手架，以项目 `plugin-guide.md` 和现有 server 插件为准。
- handoff 提到的 `docs/skills/write-mini-app-code/SKILL.md` 在 game-asset-canvas 及 packages 搜索范围内不存在，后续遵循现有 mini-app 代码与测试惯例。

## mask 应用注意事项
- 一次请求返回的是全图 mask；每个 mask 的尺寸应等于 segmentSource。
- 浏览器加载灰度 PNG 后 alpha 通常仍是 255，真实 mask 值在 RGB/R 通道；不能读取图片 alpha 当 mask。
- 正确流程：加载全图 mask -> 同 region bbox/rotate 裁 mask -> 读取灰度 -> 乘到生成图 region 的 alpha -> 可选 close -> erosion。
- 任一 region mask 缺失时应失败，不要静默使用未抠背景的白底裁图。
- 现有 `shapeSegmenter.applyMaskToRegion` 会把整图 `Uint8Array` mask 乘入生成图 bbox 的 alpha，适合作为新 SAM 路径的 RGB 保留边界；对 rotate region 应在应用 alpha 后再按 `cropRegionRotated` 做相同旋转。
- 插件商店索引会枚举模板插件目录内全部文件，因此测试放在 `packages/server/test/`，不随插件下发；插件目录可增加零依赖 `package.json` 声明 `type: commonjs`，便于 Node 测试直接 require，同时不会触发依赖安装。
- 真实 opencv backend 双框响应成功，但参考 `sam_server.py` 对 OpenCV 已是 0/255 的 uint8 mask 再乘 255，PNG extrema 实际为 0/1；前端灰度解析对 `max===1` 做 255 倍归一化，SAM/SAM2 的标准 0/255 输出不变。
- `.gitignore` 明确忽略 `packages/server/agent-spaces-data/plugins/*`，该目录是本机运行时副本；可提交 canonical 插件在 `packages/templates/plugins/sam/`。单测必须加载模板插件，实际副本通过逐文件 SHA-256 一致性检查。

## 已撤销
- 已撤销 rembg 实际插件和模板中的 `box -> rectangle` 兼容层。
- 已恢复 rembg README、换肤管线 helper/test、CLAUDE 和 handoff 的本轮契约修改。

## 换肤日志与 Viewer 重载
- 换肤表单持久化会更新节点数据并产生新的 `assets` 对象；原 Viewer 初始化 effect 直接依赖 `assets` 引用，导致 URL 未变时也 cleanup、destroy、重新初始化。
- Viewer 应以 skeleton/atlas/texture URL 的稳定签名作为初始化依赖，并通过 ref 在真正初始化时读取最新 assets。
- 素材替换日志的重要记录定义为：顶层 `data.images` 非空，或 region 级 `data.imageFlow.outputs` 非空。
- `touchRevision` 是空依赖的稳定回调；画布容器位于换肤/变换 Tabs 外，二者不会因切换 Tab 或编辑换肤表单改变 Viewer 初始化依赖。

## MaskPaint 蒙版重绘接入
- `MaskPaintDialog` 已实现 fabric.js 绘制、上传与 `onUpdate` 回传，可直接作为日志蒙版编辑器复用，不需要新增服务端插件。
- 日志当前完全封装在 `ReskinPanel` 内的 Dialog；要做右栏独立 Tab，需要把日志视图改为可嵌入组件，并由 `SpineEditorDialog` 控制右侧 Tabs 和日志数据。
- 蒙版编辑后的目标不是替换日志缩略图，而是重新应用该 region 的 alpha、重建 atlas，再调用现有 `replaceAtlas` 热更新 Viewer。
- 普通 MaskPaint 只导出绘制 ops；二值蒙版模式必须先把输入 SAM 蒙版画入可编辑层，否则原主体会丢失，且橡皮擦只能擦 overlay、无法修改原蒙版。
- `SpineEditorNode.handleReskinComplete` 会上传 PNG/atlas/Spine JSON 并更新节点输出；蒙版重绘完成后需要同时调用它，不能只热更新 Viewer，否则下游仍拿到旧贴图。

## 首次 HMR、历史删除与对比
- 阶段 8 为保留换肤表单状态给 `TabsContent value="reskin"` 增加了 `forceMount`；这会让首次进入编辑器时立刻执行 `useSpineReskinHistory`，是开发环境首次热更新的首要嫌疑。
- 当前删除生成记录只调用 `deletePersistedHistory(id)`，没有判断被删项是否正在应用，也没有恢复 `assets.png`。
- `react-compare-slider` 当前 npm latest 为 4.0.0，官方描述支持比较任意两个 React 组件；具体导出 API继续从包 README/声明文件核对。
- 仓库已经依赖 `react-compare-slider@^4.0.0`，并从 `@agent-spaces/ui` 导出 `ReactCompareSlider` 和 `ReactCompareSliderImage`；无需新增依赖。
- 材质对比使用原 atlas 与同坐标的 `previewPngUrl`，避免拿重新打包、布局不同的 atlas 做滑块比较；Spine 对比使用两组真实资源分别初始化 Viewer，不生成截图。
- 首次 HMR 的实际写路径是 `ReskinPanel` 初始 effect 调用 `onReskinDataChange → SpineEditorNode.onUpdate`；历史 Hook 初次只读配置。持久化现改为用户动作显式开启，异步配置纠正也不会写节点。

## Spine Viewer 组件对比
- 用户明确要求 Spine Tab 比较两个真实 Viewer 组件，不是换肤前后截图；`ReactCompareSlider` 的 `itemOne/itemTwo` 支持任意 ReactNode。
- `SpineEditorApp(container)`、`loadSpine`、`setSkin(name)` 足以构建只读对比 Viewer；每个 slider item 需要独立实例并在 effect cleanup 中 `destroy()`。
- 新历史保存 `spineBeforeAssets/spineAfterAssets`；旧历史可从当前原始 assets 和已有 `spineJsonUrl/atlasUrl/pngUrl` 推导两侧 Viewer。

## 右侧栏与日志缩略图
- 项目现有 `ResizablePanelGroup/ResizablePanel/ResizableHandle` 已通过 `@agent-spaces/ui` 导出；右栏采用 18%–65% 范围，默认 28%。
- 日志图片流与普通图片列表统一使用固定 `w-24` 卡片和 `h-20` 图片区域，点击仍进入原图媒体查看器。

## 局部重绘多部件参考
- CodeGraph 当前未索引 game-asset-canvas mini-app 的 Spine 换肤实现，后续改用 `rg` 精确定位。
- 交接文档确认调用链为 `ReskinPanel → reskinPipeline → edit_image/rembg → atlas → SpineEditorApp.replaceAtlas`。
- Pixi 热预览必须保持原 atlas region 坐标；导出产物可继续沿用现有 repack/new skin 流程。
- `workflow.rembg` 已是 per-slot 局部重绘的既有依赖，应复用而非新增插件。
- 工作树已有未提交的 SpineDisplay、Viewer 坐标、布局和测试改动；本阶段不得回退或覆盖这些改动。
- 主要实现入口：`ReskinPanel.jsx` 的 slot 状态/UI/`handleSlotRun`，`reskinPipeline.js` 的 `runInpaintSlot`，以及 `ReskinPanel.test.js`/reskin 测试。
- 当前 `runInpaintSlot` 仅处理一个 slot，并在生成后立即 repack 整张 atlas；它没有生成结果候选或按动画作用域状态。
- `SpineEditorDialog` 已持有当前 `animation`，但尚未传给 `ReskinPanel`；`replaceAtlasTexture` 是整图替换，天然影响所有 attachment。
- 可实现的按动作语义：结果保存 `animation`/`all` 作用域，动画切换时从默认 atlas 重新叠加当前适用的部件结果并热替换。
- 项目 UI 已有 `DropdownMenu` 与 `MoreVertical`，结果缩略图菜单可直接复用现有组件体系。
- `ReskinPanel` 在 `SpineEditorDialog` 中使用 `forceMount`，切换右侧 Tab 不会丢失局部结果状态；Dialog 可直接传入当前 `animation`。
- 多部件参考图按原始部件宽高横向无缝拼接，记录每项 `{x,y,width,height}`；拆分时按工作流实际输出宽高分别缩放坐标，再恢复到部件原尺寸。
- 所有动作替换可用原 atlas 文本 + 同尺寸 preview PNG 持久化；当前动作替换是编辑器会话预览状态，不能仅靠静态 Spine 三件套表达跨动画动态贴图规则。
- 实现选择每个 slot 的 setup attachment（缺失时取 default skin 首项），并用 `path → name → attachment key` 匹配 atlas region。
- 生成结果保留为独立 canvas；Viewer atlas 每次从原始 region 集合重建，当前动作结果优先于所有动作，临时预览优先级最高。

## 局部重绘回归诊断
- 压扁根因：`scalePartLayout` 分别使用 `outputWidth/layout.width` 与 `outputHeight/layout.height`，当工作流输出 aspect 与拼接图不同，裁区宽高比发生变化，再绘制回原尺寸时必然变形。
- 抠图根因：局部重绘直接调用 `workflow.rembg/rembg_remove`，绕过项目统一 `utils/cutout.js::runCutout`；抠图节点默认 workflow 模式走 `image_enchanter` 的 `process_type=segment`。
- 持久化根因：`slotResults` 仅为 React state，包含不可序列化 `HTMLCanvasElement`；`normalizeReskinEditorData` 也未接收局部结果字段。
- 修复后只持久化最终抠图 PNG 的稳定 URL、尺寸、region、scope 和 animation；重开时加载 URL 并重建 canvas，避免把 DOM 对象写入节点数据。
- 拼接图先按最近 workflow aspect 透明留白；输出拆分用统一 scale + 居中 offset，抠图结果再用 contain 回填，从两处阻止宽高比失真。

## 工作流抠图返回解析
- CodeGraph 确认 `runWorkflow` 返回 `extractOutput(steps)` 的标准图片结构；`generateImages` 兼容 `result[]`、`images[]`、`image_urls[]` 和字符串 `result`。
- `runWorkflowCutout` 仅读取 `out.urls`，因此工作流成功返回 `images` 时仍误报“工作流抠图未返回图片”。
- `ReskinPanel.addLog` 当前先执行 `hasReskinLogImageOutput(data)`，错误数据 `{error:true}` 没有图片，会被直接丢弃。
- 修复采用与 `generateImages` 一致的返回兼容范围，并保留旧 `urls`；空返回仅记录键名和类型，不输出完整响应或图片内容。
- 错误日志过滤条件改为 `step !== 'error' && !hasReskinLogImageOutput(data)`，局部重绘另用 `role="alert"` 就地显示失败原因。

## 跨动作 attachment 应用
- 当前 `buildSlotAtlas` 只执行 `parts[result.regionName] = result.imageCanvas`；scope 虽会随动画重算，但目标 atlas region 永远是提交生成时的 setup region。
- Spine 动画可通过 `animations.<animation>.slots.<slot>.attachment[]` 切换 attachment，同一 slot 在不同动作中可能使用不同 atlas regions。
- 当前动作应覆盖 setup attachment 和该动作 timeline 中出现的 attachments；所有动作应覆盖 default skin 中该 slot 的全部 region attachments。
- `SpineJsonExporter` 对二进制资源只导出 skins/slots，不导出 animations；当前动作在无 timeline 时采用“scope 按动画门控 + slot 全 regions”降级，保证视觉语义正确。
- `selectApplicablePartResults` 改为以 `slot || regionName` 为 key，防止同一 slot 的全局/动作/预览结果因 region 不同同时生效。
