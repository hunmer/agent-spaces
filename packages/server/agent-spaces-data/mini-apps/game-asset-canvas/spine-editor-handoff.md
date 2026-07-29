# Handoff: 骨骼编辑器 + AI 换肤（spineEditor 节点）

> 本文件记录 game-asset-canvas 的 `spineEditor` 节点：Spine 骨骼编辑器 + AI 换肤功能。
> 总体 mini-app 架构见 `src/handoff.md`；本文件只聚焦骨骼编辑器与换肤。
> mini-app 根：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/`

## 功能概览

### 骨骼编辑器（已实现）
用户上传 `.skel/.json + .atlas + .png` 三件套（或从内置角色库选择），在 iframe 内用 PixiJS + pixi-spine 渲染角色，可视化骨骼层级、拖拽调整骨骼变换、切换皮肤/动画、导出姿势/截图/录制/三件套。

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
mini-app React 节点                    vendor 独立 SPA（PixiJS v7）
┌────────────────────────┐            ┌─────────────────────────────────┐
│ SpineEditorNode.jsx    │  iframe    │ spine-editor-build/src/          │
│  - FileUpload 三件套    │ ─────────► │   main.js（postMessage 路由）     │
│  - 打开骨骼编辑器按钮    │            │   core/SpineEditorApp.js         │
│                        │ postMessage│   loaders/SpineLoader.js         │
│ SpineEditorDialog.jsx  │ ◄───────── │   exporters/                     │
│  - 同源 URL 构造        │            │     PoseExporter / SpineJsonExporter│
│  - ready/inject/export │            │   ui/Toolbar/BoneTree/...        │
│  - requestSnapshot     │            │                                  │
│  - requestSpineJson    │            │ 构建产物 → src/vendor/spine-editor-web/│
│  - replaceAtlas 桥接    │            │   index.html + assets/           │
│                        │            └─────────────────────────────────┘
│ ReskinPanel.jsx        │
│  - 全局换肤/局部重绘切换 │            ┌─────────────────────────────────┐
│  - method/segMethod 选 │            │ src/utils/reskin/（纯 JS 换肤逻辑）│
│  - 侵蚀开关/半径        │            │   reskinPipeline.js（核心串联）   │
│  - 日志区/皮肤历史      │            │   compositeBuilder / explodedComposer│
│  - onReskinComplete    │            │   shapeSegmenter / atlasReader   │
└────────────────────────┘            │   atlasPacker / atlasRepack      │
                                      │   skinWriter / canvasUtils       │
                                      │   spineDataToJson                │
                                      └─────────────────────────────────┘
```

## AI 换肤 Pipeline（reskinPipeline.js）

```
① 取素材：snapshot(iframe截图) + 原 atlas sheet + 原 .atlas 文本 + spine JSON
   (.skel 资源 → iframe 内 SpineJsonExporter 反向导出最小 JSON)
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
   → postMessage replace-atlas 热加载预览 + 存历史 + 可导出三件套
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
| **集成方式** | 独立 Vite SPA + iframe + postMessage | vendor SPA 跑 iframe，COOP 隔离下不能直连 window.AgentSpaces |
| **换肤算力位置** | 纯逻辑在 mini-app 主应用，iframe 只做预览 | 主应用可直连 callPluginTool/uploadFile |
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
| `src/components/SpineEditorDialog.jsx` | iframe 桥接：inject/snapshot/spineJson/replaceAtlas 消息收发 |
| `src/components/nodes/SpineEditorNode.jsx` | 节点：FileUpload + 打开编辑器 + onReskinComplete 上传三件套 |

**注册**（6 处，刷新即生效）：constants.js / canvas-constants.js / api.js / tools.js / RightPanel.jsx 的 `spineEditor` 条目。

### vendor SPA（`spine-editor-build/src/`，构建后拷到 `src/vendor/spine-editor-web/`）
| 文件 | 职责 |
|---|---|
| `main.js` | 入口 + postMessage 路由（inject/snapshot/replaceAtlas/spine-json/get-atlas-info）|
| `core/SpineEditorApp.js` | Pixi 封装：渲染/缩放/模式/截图 + replaceAtlasTexture + getAtlasInfo |
| `core/BoneGizmoLayer.js` | 骨骼连线+圆点+拖拽交互 |
| `loaders/SpineLoader.js` | 加载 spine（挂 _atlas/_baseTexture 供热加载）|
| `exporters/PoseExporter.js` | 姿势 JSON 导出 |
| `exporters/SpineJsonExporter.js` | **新增**：从 spine 实例导出最小 JSON（支持 .skel）|
| `ui/Toolbar/AssetFilter/BoneTree/TransformPanel.js` | DOM UI |

## postMessage 协议（SpineEditorDialog ↔ main.js 配对）

**父→iframe**：
- `spine:inject-assets` `{skelDataUrl, atlasDataUrl, pngDataUrl, name}`
- `spine:inject-background` `{imageUrl}`（占位未实现）
- `spine:request-snapshot` → iframe 截图回 `spine:snapshot {dataUrl}`
- `spine:replace-atlas` `{pngDataUrl, name}` → 热加载新 sheet 预览
- `spine:get-atlas-info` → 回 `spine:atlas-info {sheetW, sheetH, regionCount}`
- `spine:request-spine-json` → iframe 导出最小 JSON 回 `spine:spine-json {json}`

**iframe→父**：
- `spine:ready` → 触发注入资源
- `spine:export-pose` `{json, name}` → 文本直传
- `spine:export-screenshot` `{dataUrl, name}` → uploadFile
- `spine:export-video` `{dataUrl, name}` → uploadFile（WebM）
- `spine:export-spine` `{files:[{name,dataUrl}]}` → 逐个 uploadFile
- `spine:snapshot` `{dataUrl}` | `{error}` — 换肤截图回传
- `spine:atlas-replaced` `{name}` | `{error}` — 热加载结果
- `spine:spine-json` `{json}` | `{error}` — spine JSON 导出结果

## 重建 SPA 产物（改了 spine-editor-build/src 后必做）

```bash
cd "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/spine-editor-build"
npm run build
# 把 dist 内容拷到 src/vendor/spine-editor-web/：
cd ..
VENDOR="src/vendor/spine-editor-web"
cp -f spine-editor-build/dist/index.html "$VENDOR/index.html"
rm -rf "$VENDOR/assets"
cp -r spine-editor-build/dist/assets "$VENDOR/assets"
```
注意：vite 缓存可能让文件名不变，改代码后务必 `rm -rf dist node_modules/.vite` 强制重建。

## 插件依赖

换肤功能依赖两个插件（需在宿主配置）：
- **nano-banana**（`workflow.nano-banana`）：AI 图像编辑，动作 `nano_banana_edit_image`，需配置 apiKey
- **rembg**（`workflow.rembg`）：背景去除/SAM 分割，动作 `rembg_sam_segment` / `rembg_remove`，需配置 baseUrl

## 已知限制

1. **角色库远程加载**：`loadFromLibrary` 走 `FrankoFPM.github.io/Spine-Viewer-Web`，依赖该 gh-pages 在线
2. **bg_components 精度**：形状交集法要求换肤 pose-consistent；部件挪位时精度有限（flood fill + IoU fallback 未实现）
3. **SAM prompt**：用 region bbox 中心点；精度不足时可改 box prompt
4. **bundle 体积**：pixi+pixi-spine gzip 约 213KB，首次加载 1-2 秒
5. **`src/vendor/spine-editor-web/spine-editor-src/`**：空残留目录（历史命名错误，源码实际在 spine-editor-build/src），被占用未删，不影响功能

## 验收路径

### 骨骼编辑器
1. 刷新页面 → 右侧「编辑」分类有「🦴 骨骼编辑器」卡片
2. 拖入画布 → 上传 .skel/.json + .atlas + .png → 点「打开骨骼编辑器」→ iframe 加载
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
