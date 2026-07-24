## 像素编辑器节点（PixelEditorNode）实现方案

### 一、方案核心（已验证可行）
- **piskel 走 vendor 本地化 + 同源 iframe**（绕开跨域拦截，piskel 无 postMessage API）
- **资源加载链路已验证通**：iframe.src 用 path 段形式 `{origin}/api/mini-apps/game-asset-canvas/src/file/vendor/piskel-embed/editor/index.html`。宿主 `middleware/auth.ts:36` 对 path 段 src/file **直接放行无需 token**（专为 Excalidraw 的 `new URL(rel, base)` 设计）。editor/index.html 内的相对资源（`./js/...`、`./css/...`、字体、图标）会被浏览器用此 base 解析成同级 path 段 URL，全部放行 → **零宿主改动**。
- 复用宿主 `window.AgentSpaces.srcFileUrl` / `proxyImageUrl` / `uploadFile`；复用 mini-app 现有 `urlToImageData` / `imageDataToDataUrl`。

### 二、改动清单（全部在 game-asset-canvas mini-app 内，零宿主改动）

#### 1. 新增 piskel 静态资源（vendor 本地化）
- 从 `github.com/piskelapp/piskel-embed` 拉取整个 `editor/` 目录到 `game-asset-canvas/src/vendor/piskel-embed/editor/`
  - 含 `index.html`、`piskel-boot.js`、`js/piskel-packaged-min.js`（461KB）、`css/piskel-style-packaged-*.css`、`css/fonts/*`、`img/*`、`templates/**`
  - 用 `gh api` 递归下载（约 5-10MB，~80 个文件）
- **不修改 editor/index.html**（保持官方原样，相对路径 `./js/...` 等让浏览器自动解析）

#### 2. `src/utils/constants.js`（改）
- `NODE_TYPES` 加 `pixelEditor: 'pixelEditor'`
- `NODE_META` 加 `[NODE_TYPES.pixelEditor]: { label: '像素编辑器', icon: '👾', color: '#22c55e' }`
- `IMAGE_TAGS` 加 `pixelEditor: '像素'`

#### 3. `src/components/nodes/PixelEditorNode.jsx`（新增，仿 ImageEditorNode/FrameEditorNode）
- 输入：FileUpload 多图（maxFiles=0）+ 上游连线多图，合并去重（同 FrameEditorNode 的 dedupe 逻辑）
- 渲染：FileUpload + 上游连线只读占位 + 输入统计 + 「👾 编辑像素」按钮 + 产出 ImageResult
- 按钮 onClick → `setEditorOpen(true)` 打开 PixelEditorDialog
- `handleSave(urls)` → `onUpdate({ status:'done', output:{images:urls} })`

#### 4. `src/components/PixelEditorDialog.jsx`（新增，仿 FrameEditorDialog）
- Dialog 尺寸 `90vw × 92vh`
- 顶部工具条：导出模式切换（Sprite Sheet PNG / 每帧 PNG 单选/下拉）+ 导出按钮 + 关闭
- 主体：一个 `<iframe>` 占满，src 由 `buildPiskelUrl()` 生成
  ```js
  const base = window.AgentSpaces.srcFileUrl('vendor/piskel-embed/editor/index.html')
    // srcFileUrl 默认产出 query 形式，需手动改成 path 段形式（去掉 ?path=&token=，改成 /path 段）
  ```
  → 自写 `piskelEditorUrl()`：`{origin}/api/mini-apps/{projectId}/src/file/vendor/piskel-embed/editor/index.html`（从 srcFileUrl 提取 origin/projectId，或直接用 `window.location.origin` + 从 srcFileUrl 解析 projectId）
- **iframe onLoad 加载流程**（同源，可直接访问 contentWindow.pskl）：
  1. 等待 piskel 就绪（轮询 `iframe.contentWindow.pskl?.app?.piskelController`，最长 10s）
  2. 把每张输入图 URL → `proxyImageUrl` → `urlToImageData` → 取首张尺寸作 frameSize（W×H），其余缩放/裁齐到同尺寸
  3. 横向拼成一张 sheet PNG（N×W 宽 × H 高）→ `imageDataToDataUrl(imageData,'image/png')`
  4. 构造 piskel 数据 `{modelVersion:2, piskel:{name,description,fps:12,height:H,width:W,layers:[JSON.stringify({name:'Layer 1',frameCount:N,base64PNG:dataUrl})]}}`
  5. 调官方链：`new pskl.model.piskel.Descriptor(name,'',true)` + `pskl.utils.serialization.Deserializer.deserialize(data, cb)` + `setPiskel` + `setFPS(12)`
- **导出**（两种模式，从 pskl 读当前 sprite）：
  - 读帧：`const pc = pskl.app.piskelController; const count = pc.getFrameCount(); const frames = Array.from({length:count},(_,i)=>pc.getFrameAt(i))`（每帧是 `pskl.model.Frame`，`.getWidth()`/`.getHeight()`/`.getPixels()` 返回 `Uint8ClampedArray` 的 RGBA）
  - 模式 A（Sprite Sheet）：各帧 ImageData 等宽后横向拼接成一张 → `imageDataToBlob` → uploadFile → `[url]`
  - 模式 B（每帧）：逐帧 → blob → uploadFile → 多个 url
  - 调 `onSave(urls)` + `onClose()`
- **错误兜底**：iframe 加载失败 / pskl 10s 未就绪 → 顶部红字提示（断网/资源缺失不崩溃，同 FrameEditorDialog 约定）
- **卸载**：iframe 随 Dialog 卸载自动销毁，无需特殊清理

#### 5. `src/components/Canvas.jsx`（改，4 处，与 frameEditor 完全对称）
- `NODE_COMPONENTS` 加 `[NODE_TYPES.pixelEditor]: PixelEditorNode`
- `ADD_NODE_ITEMS` 加 `{ type: NODE_TYPES.pixelEditor }`
- `computeInputImages` 的 `isReceiver` 加 `|| node.type === NODE_TYPES.pixelEditor`
- `DEFAULT_SIZE` 加 `[NODE_TYPES.pixelEditor]: { w: 300, h: 260 }`
- `initialData` 加 `if (type === NODE_TYPES.pixelEditor) return { uploadedImages:[], output:{images:[]}, status:'idle' }`
- import 加 PixelEditorNode

#### 6. `src/components/RightPanel.jsx`（改）
- `ADD_ITEMS` 加 `{ type: NODE_TYPES.pixelEditor, label: '像素编辑器' }`

### 三、关键技术点已确认
1. **srcFileUrl 用 path 段**：宿主 query 形式 src/file 要求 token，但 iframe 内嵌相对资源无法带 token；path 段形式免 token（auth.ts:36 放行）。需自拼 path 段 URL。
2. **同源访问 pskl**：iframe src 是本站 `/api/mini-apps/...`，与父页面同源 → `iframe.contentWindow.pskl` 可直接访问，无跨域拦截。
3. **图片→piskel layer 格式**：piskel 把整张 base64PNG 当横向 sheet，`frameCount` 帧每帧 `width`，层 PNG 宽 = frameCount×width。需先等宽拼接。
4. **导出读帧 API**：`pskl.app.piskelController.getFrameAt(i).getPixels()` 返回 RGBA 数组 → 包成 ImageData → 走现有 io.js。

### 四、验证步骤（不做自动化测试，手动验收）
1. 画布右栏新增节点 tab 出现「像素编辑器」
2. 拖出节点，上传/连入多图，点「👾 编辑像素」弹出对话框，iframe 加载 piskel（不白屏）
3. piskel 内出现输入的多帧（每帧一张图，时间轴可见）
4. 画几笔，切「Sprite Sheet」导出 → 节点产出一张拼接 PNG；切「每帧 PNG」→ 产出多张
5. 产出可连线下游，NodeToolbar 导出/抠图/放大按钮可用
6. 断网（删 vendor 资源模拟）→ 对话框顶部红字，不崩溃

### 五、后续优化（不在本次）
- piskel fps / 画布尺寸参数暴露到对话框顶部
- 单帧输入时跳过拼接直接进 piskel
- 导出格式加 GIF（复用 encodeFramesToGif）
- handoff.md / CLAUDE.md 更新（本轮末尾补）
