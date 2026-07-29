# Handoff: 骨骼编辑器 + AI 换肤（spineEditor 节点）

> 本文件记录 game-asset-canvas 的 `spineEditor` 节点：Spine 骨骼编辑器 + AI 换肤功能。
> 总体 mini-app 架构见 `src/handoff.md`；本文件只聚焦骨骼编辑器与换肤。
> mini-app 根：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`

## 2026-07-29 迁移完成

- 已移除独立 `spine-editor-build` Vite 项目和 `vendor/spine-editor-web` iframe 产物。
- 编辑核心迁入 `src/spine/`，由 `SpineEditorDialog.jsx` 直接初始化和销毁。
- 工具栏、角色库、骨骼树、变换面板、换肤面板全部使用 `@agent-spaces/ui`。
- 变换与换肤合并为同一个右侧 Tabs 侧边栏。
- PixiJS、pixi-spine、JSZip 固定版本 dist 保存在 `src/vendor/spine/`，由 `src/spine/runtime.js` 本地加载。
- 固定版本：`pixi.js@7.3.3`、`@pixi-spine/all-3.8@4.0.6`、`jszip@3.10.1`。

## 功能概览

### 骨骼编辑器（已实现）
用户上传 `.skel/.json + .atlas + .png` 三件套（或从内置角色库选择），在 mini-app 对话框内用 PixiJS + pixi-spine 渲染角色，可视化骨骼层级、拖拽调整骨骼变换、切换皮肤/动画、导出姿势/截图/录制/三件套。

### AI 换肤（已实现）
把原 Python 后端（`reskin-app`）的换肤 pipeline **全部迁移到前端**（除 SAM 分割调 rembg 插件外），集成进骨骼编辑器：
- 支持 **两种合成方法**：atlas（截图+atlas 左右并排）/ exploded（爆炸图）
- 支持 **两种分割方法**：sam（rembg SAM 逐 region 抠图）/ bg_components（形状交集法，纯前端像素遍历）
- 支持 **.skel 资源换肤**（从 pixi-spine 实例反向导出最小 spine JSON）
- 支持 **per-slot 局部重绘**（只重绘一个部位，锁 silhouette）
- 支持 **侵蚀去白边**（UI 开关 + 半径调节）
- **热加载预览**：换肤后 `baseTexture.setResource()` 即时在画布看到效果，无需重载
- **皮肤历史**：localStorage 持久化，点击即应用
- **实时日志**：pipeline 每步上报

## 架构

```
mini-app React 节点
┌─────────────────────────────────────────────────────────────┐
│ SpineEditorNode.jsx                                         │
│  - FileUpload 三件套                                         │
│  - 打开骨骼编辑器按钮                                         │
│                                                             │
│ SpineEditorDialog.jsx                                       │
│  - React 工具栏 / 角色库 / 骨骼树                              │
│  - Canvas + SpineEditorApp                                  │
│  - 右侧 Tabs：Transform / ReskinPanel                        │
│  - 截图 / 姿势 / 录制 / ZIP 导出                              │
│                                                             │
│ src/spine/                                                  │
│  - core / loaders / exporters / components / runtime        │
│                                                             │
│ src/vendor/spine/                                           │
│  - pixi / pixi-spine / jszip 固定版本 dist                   │
└─────────────────────────────────────────────────────────────┘
```

## AI 换肤 Pipeline（reskinPipeline.js）

```
① 取素材：Canvas snapshot + 原 atlas sheet + 原 .atlas 文本 + spine JSON
   (.skel 资源 → SpineJsonExporter 从当前实例反向导出最小 JSON)
   ↓
② 合成 composite（按 method 分流）：
   - atlas：[snapshot | atlas_sheet] 左右并排（compositeBuilder.js）
   - exploded：region 按 attachment 位置摆放 + 迭代分离重叠（explodedComposer.js）
   ↓
③ nano-banana 插件 Gemini 重绘 composite（geminiRedraw 公共函数）
   callPluginTool('workflow.nano-banana','nano_banana_edit_image',{image,prompt,model})
   ↓
④ 分割回切（按 segMethod 分流）：
   - sam：逐 region 裁出 → rembg_sam_segment(bbox 中心 point prompt) → 抠图 PNG
   - bg_components：形状交集法（原轮廓 ∩ 新alpha，纯像素遍历，shapeSegmenter.js）
   - (可选侵蚀去白边：erodeAlpha，半径按 region 边长缩放)
   ↓
⑤ repack：region PNG 用 shelf packing 打包成新 atlas sheet（atlasRepack.js + Canvas 合成）
   ↓
⑥ skin_writer：往 spine JSON 的 skins 加新 skin（skinWriter.js，兼容 3.8 dict / 4.0 array）
   ↓
⑦ 产出：新 atlas PNG + 新 .atlas + 新 spine JSON + 原 .skel
   → SpineEditorApp.replaceAtlasTexture 热加载预览 + 存历史 + 可导出三件套
```

### per-slot 局部重绘（runInpaintSlot）
只重绘一个 slot 的 region（锁 silhouette，**不跑 SAM**）：
单 region 送 Gemini（SLOT_PROMPT 约束保持形状）→ rembg 清背景 → 复用 repack/addSkin 组装。

## 关键技术决策

| 决策点 | 方案 | 原因 |
|---|---|---|
| **Spine 运行时** | `@pixi-spine/all-3.8@4.0.6` + `pixi.js@^7.3.3` | 碧蓝航线角色库全是 3.8；all-4.0 只含 4.0 loader |
| **PixiJS API** | v7 旧 Graphics API（drawCircle/beginFill）+ extract.canvas() | v8 新 API 不兼容 |
| **骨骼坐标对齐** | `_boneToContainer(bone)` 经 spine.worldTransform 转容器坐标 | bone.worldX/Y 是 skeleton 空间 |
| **worldTransform 同步** | redraw 前手动 `spineContainer.updateTransform()` | ticker 回调读的是上一帧 |
| **集成方式** | mini-app React 直接集成 | 统一宿主 UI，去掉独立项目、iframe 和 postMessage |
| **换肤算力位置** | 全部在 mini-app 主应用 | 可直连 callPluginTool/uploadFile，并与编辑器共享实例 |
| **AI 编辑** | nano-banana 插件（封装 Gemini） | 语义与原后端一致，key 在后端不暴露 |
| **SAM 分割** | rembg 插件 rembg_sam_segment | 复用 mini-app 抠图能力 |
| **bg_components** | 形状交集法（不引 opencv.js） | 纯像素遍历，pose-consistent 换肤够用 |
| **.skel→.json** | SpineJsonExporter 从 Skin.getAttachments() 反向提取 | pixi-spine 不支持导出；只需 skins 段标量字段 |
| **热加载预览** | baseTexture.setResource()（UV 不动） | 无需重载 .skel，region 布局一致即可 |
| **主题** | 亮色（画布背景 #eef0f3） | 按用户要求 |

## 文件清单

### mini-app 主应用（`src/`）

**换肤工具模块**（`src/utils/reskin/`，纯 JS 无第三方依赖）：
| 文件 | 职责 |
|---|---|
| `reskinPipeline.js` | **核心串联**：runReskin（全局换肤）+ runInpaintSlot（局部重绘）+ geminiRedraw 公共函数 |
| `compositeBuilder.js` | [snapshot\|atlas] 合成 + 裁半边 + ATLAS_RESKIN_PROMPT |
| `explodedComposer.js` | 爆炸图合成 + EXPLODED_RESKIN_PROMPT |
| `shapeSegmenter.js` | 形状交集分割（buildOriginalSilhouettes / segmentByShapeIntersection / applyMaskToRegion）|
| `atlasReader.js` | 解析 .atlas 文本 → regions + safeFilename |
| `atlasPacker.js` | shelf bin-packing + nextPow2 |
| `atlasRepack.js` | 打包 region 成新 sheet + 写 .atlas 文本 |
| `skinWriter.js` | 往 spine JSON 加 skin + regionToSlotMap（兼容 3.8/4.0）|
| `canvasUtils.js` | Canvas 图像操作（loadImage/cropRegionRotated/erodeAlpha/pasteToSheet）|
| `spineDataToJson.js` | 从 pixi-spine 实例提取最小 spine JSON（.skel 支持，主应用侧备用）|

**组件**：
| 文件 | 职责 |
|---|---|
| `src/components/ReskinPanel.jsx` | 换肤面板：全局/局部切换 + method/segMethod 选 + 侵蚀开关 + 日志 + 历史 |
| `src/components/SpineEditorDialog.jsx` | React 编排：runtime、Canvas、工具栏、侧边栏、导出 |
| `src/components/nodes/SpineEditorNode.jsx` | 节点：FileUpload + 打开编辑器 + onReskinComplete 上传三件套 |

**注册**（6 处，刷新即生效）：constants.js / canvas-constants.js / api.js / tools.js / RightPanel.jsx 的 `spineEditor` 条目。

### 编辑核心（`src/spine/`）
| 文件 | 职责 |
|---|---|
| `core/SpineEditorApp.js` | Pixi 封装：渲染/缩放/模式/截图 + replaceAtlasTexture + getAtlasInfo |
| `core/BoneGizmoLayer.js` | 骨骼连线+圆点+拖拽交互 |
| `loaders/SpineLoader.js` | 加载 spine（挂 _atlas/_baseTexture 供热加载）|
| `exporters/PoseExporter.js` | 姿势 JSON 导出 |
| `exporters/SpineJsonExporter.js` | **新增**：从 spine 实例导出最小 JSON（支持 .skel）|
| `components/SpinePanels.jsx` | 宿主 UI：角色库、骨骼树、变换面板 |
| `runtime.js` | 从 `src/vendor/spine/` 加载 PixiJS、pixi-spine、JSZip |

## 更新第三方 dist

固定版本文件保存在 `src/vendor/spine/`。升级时从 npm 官方包的 jsDelivr dist 路径下载，并同步更新 `src/spine/runtime.js` 文件名与本节版本记录；项目本身无需 npm install 或构建。

## 插件依赖

换肤功能依赖两个插件（需在宿主配置）：
- **nano-banana**（`workflow.nano-banana`）：AI 图像编辑，动作 `nano_banana_edit_image`，需配置 apiKey
- **rembg**（`workflow.rembg`）：背景去除/SAM 分割，动作 `rembg_sam_segment` / `rembg_remove`，需配置 baseUrl

## 已知限制

1. **角色库远程加载**：`loadFromLibrary` 走 `FrankoFPM.github.io/Spine-Viewer-Web`，依赖该 gh-pages 在线
2. **bg_components 精度**：形状交集法要求换肤 pose-consistent；部件挪位时精度有限（flood fill + IoU fallback 未实现）
3. **SAM prompt**：用 region bbox 中心点；精度不足时可改 box prompt
4. **bundle 体积**：pixi+pixi-spine gzip 约 213KB，首次加载 1-2 秒

## 验收路径

### 骨骼编辑器
1. 刷新页面 → 右侧「编辑」分类有「🦴 骨骼编辑器」卡片
2. 拖入画布 → 上传 .skel/.json + .atlas + .png → 点「打开骨骼编辑器」→ 对话框加载
3. 左侧角色库选角色 / 骨骼树点选 / 左键拖移动 / 右键拖旋转 / Ctrl+Z 撤销
4. 导出截图/姿势/录制/三件套 → 经 uploadFile 回传节点

### AI 换肤
1. 打开骨骼编辑器 → 右侧「🎨 AI 换肤」面板
2. 全局换肤：选合成方法(atlas/exploded) + 分割方法(sam/bg_components) + 输入描述 → 开始
3. .skel 资源也能换肤（日志显示「从编辑器导出 spine JSON」）
4. 局部重绘：切到局部模式 → 选部位 → 输入描述 → 重绘该部位
5. 观察日志：合成→Gemini→分割进度(N/总数)→打包→完成
6. 完成后画布热加载预览 + 历史记录可点击应用
7. 节点 output 含新三件套 URL（供下游连线）

## Suggested Skills

- **write-mini-app-code**（`docs/skills/write-mini-app-code/SKILL.md`）— 改本 mini-app 前必读
- **diagnose** — 若有新的骨骼线错位/加载失败/换肤失败 bug，用此 skill 系统化诊断
- **handoff** — 继续交接时用
