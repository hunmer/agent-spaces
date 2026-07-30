# 新增 Spine 展示节点（spineDisplay）

## 核心思路
新增一个轻量「Spine 展示节点」：上传三件套（或连线上游接收）→ 节点内直接用 PIXI 渲染 Spine → 动画播放/暂停/切换 + 皮肤切换 → 输出 spineAssets 对象供下游 SpineEditor 节点消费。

**最大化复用现有资产**：runtime.js / SpineLoader.loadSpine / getAnimations / getSkins / ViewUtils.calculateFitTransform 全部直接复用；展示渲染逻辑从 SpineEditorApp 裁剪出一个精简版 `SpinePreviewApp`。

## 文件改动清单（10 处）

### A. 新增文件（3 个）

**1. `src/spine/core/SpinePreviewApp.js`**（新，约 150 行）
- 从 SpineEditorApp 裁剪：仅保留 `constructor / init / setSpine / setAnimation / setSkin / setPlaybackSpeed / setMode('play'固定) / _onTick / fitView / destroy`
- 删除：gizmo 层、history、骨骼编辑变换方法、换肤AI、录制、视图交互绑定
- `init()` 用 PIXI.Application 自建 canvas append 进容器（同 SpineEditorApp 模式）
- `_onTick()` 仅 play 模式 `spine.update(dt)`（展示节点只播放，不做 pose 编辑）

**2. `src/utils/spine-url.js`**（新，约 20 行）
- 抽取 SpineEditorDialog.jsx:69-83 的 `urlToDataUrl(url)` 为公共函数
- SpineEditorDialog 改为从这里 import（消除重复）
- 展示节点也用同一个函数把三件套 http URL → dataUrl 喂给 loadSpine

**3. `src/components/nodes/SpineDisplayNode.jsx`**（新，约 280 行）
- **外壳**：NodeShell + targetHandle + sourceHandle（与 SpineEditorNode 一致，保持菜单/resize/选中统一）
- **上传**：`@agent-spaces/ui` 的 FileUpload（maxFiles=3），复用 SpineEditorNode 的 handleFilesChange 三件套解析逻辑（.skel/.atlas/.png 分流 + uploadFile + name 派生 + 完整性校验）
- **渲染**：节点内一个 `<div ref={containerRef}>` 承载 PIXI canvas；`useViewportActivation(rootRef)` 视口外暂停 ticker 省性能
- **加载链**：spineAssets 变化 → loadSpineRuntime() → urlToDataUrl(三件套) → loadSpine() → previewApp.setSpine() → getAnimations/getSkins 填下拉
- **控制条**（选中时显示，`nodrag nopan nowheel`）：动画下拉、皮肤下拉、播放/暂停按钮、播放速度 slider
- **数据存储**（遵守 handoff #15）：三件套 URL 存 `data.spineAssets={skel,atlas,png,name}`；当前动画/皮肤存 `data.params={animation,skin,playbackSpeed,playing}`
- **输出**：`data.spineAssets` 即输出（下游 spineEditor 读它，非走 output.images）

### B. 修改文件（7 处）

**4. `src/utils/constants.js`**
- `NODE_TYPES` 加 `spineDisplay: 'spineDisplay'`
- `NODE_META` 加 `{ label: 'Spine展示', icon: '🦴', color: '#8b5cf6' }`

**5. `src/utils/canvas-constants.js`**
- `NODE_COMPONENTS` 注册 SpineDisplayNode
- `ADD_NODE_ITEMS` 加 `{ type: NODE_TYPES.spineDisplay }`
- `DEFAULT_SIZE` 加 `{ w: 320, h: 360 }`
- `initialData` 加分支：`{ status:'idle', spineAssets:null, params:{animation:'',skin:'',playbackSpeed:1,playing:true} }`

**6. `src/utils/input-images.js`**（新增第三套转发）
- 仿 `computeInputVideos`(L103-150) 新增 `computeInputSpineAssets(nodes, edges)`
- `SPINE_RECEIVER_TYPES = { spineDisplay, spineEditor }`
- `SPINE_PASSTHROUGH_TYPES = { spineDisplay }`（展示节点透传：无自身产出时回退 data.spineAssets）
- `sourceSpineAssets(node)`：优先 `node.data.output.spineAssets` → 透传类回退 `node.data.spineAssets`
- 返回 `Map<nodeId, { spineAssets, isDisplay }>`

**7. `src/hooks/useDecoratedNodes.js`**
- import `computeInputSpineAssets`
- 新增 `upstreamSpineMap` useMemo（L34-35 旁）
- 注入分支（L67-80 旁）：若 `upSpine` 存在，`data.spineAssets = upSpine.spineAssets`

**8. `src/components/nodes/SpineEditorNode.jsx`**（接收上游）
- 读取上游注入的 `data.spineAssets`：若自身未上传（`!data.uploadedAssets`）且上游有，则用上游的填充 FileUpload value + uploadedAssets，并标记 source='upstream'
- 复用 SpineEditorNode 现有 handleFilesChange（用户手动上传覆盖上游）

**9. `src/components/RightPanel.jsx`**
- `ADD_ITEMS` 加 `{ type: NODE_TYPES.spineDisplay, label: 'Spine展示', category: 'edit' }`

**10. `src/api.js` + `src/tools.js`**
- `api.js` 的 `VALID_NODE_TYPES`(L12) + `NODE_LABELS`(L49) 加 spineDisplay
- `tools.js` 的 `NODE_TYPE_ENUM`(L10) + `NODE_TYPE_DESC`(L47) 加 spineDisplay 描述

## 关键实现细节

**数据流（连线协议）**：
```
spineDisplay 节点
  data.spineAssets = {skel,atlas,png,name}  ← 上传/上游注入
        │ (sourceHandle)
        ▼
computeInputSpineAssets 派生
        │
        ▼
useDecoratedNodes 注入 data.spineAssets
        │
        ▼
spineEditor 节点读 data.spineAssets → 自动填充 FileUpload
```

**资源加载顺序**：uploadFile 拿 http URL → 存 data.spineAssets → PIXI 渲染时 urlToDataUrl 转 dataUrl → loadSpine 解析

**视口优化**：`useViewportActivation` 确保滚出视口的节点暂停 PIXI ticker，避免多节点卡顿

**与 spineEditor 的区别**：spineDisplay 是只读预览（不开 Dialog、不编辑骨骼、不导出姿势/视频）；spineEditor 是完整编辑器。两者可串联：展示节点接上游三件套预览 → 连到编辑器节点做修改。

## 不做的事
- 不支持 Spine 4.0/4.1（现有 runtime 不支持，需另引包，工作量过大）
- 不做录制/导出视频/GIF（用户未要求）
- 不做骨骼编辑/姿势导出（那是 spineEditor 的职责）
- 不改 react-renderer allowlist（pixi-spine 走 vendor fetch + eval，不经 allowlist）

## 验收标准
1. 右侧面板/右键菜单出现「Spine展示」节点，可拖入画布
2. 上传 .skel+.atlas+.png 三件套后，节点内 PIXI canvas 渲染出 Spine 角色
3. 选中节点后出现动画下拉/皮肤下拉/播放暂停按钮，可切换
4. 从 spineDisplay 的 sourceHandle 连线到 spineEditor 的 targetHandle，spineEditor 自动填充三件套
5. 刷新页面后节点状态保留（spineAssets + params 持久化）

## 风险点
- SpinePreviewApp 从 SpineEditorApp 裁剪，需仔细剥离 gizmo/history 依赖，避免 import 遗留导致报错（实现时会用 babel 自检）
- urlToDataUrl 抽取后 SpineEditorDialog 改 import，需确认不破坏现有编辑器功能