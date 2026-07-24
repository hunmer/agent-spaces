## 像素编辑器节点（PixelEditorNode）—— 基于 Pixelorama 实现方案

### 一、方案核心
- **编辑器**：用本地 Pixelorama web 版（D:\Pixelorama_web，Godot 4.7 导出），改 D:\Pixelorama 源码加「外部 JS 注入图片 / 导出回传」入口，重新导出后作为 game-asset-canvas 的 vendor 资源，iframe 同源加载。
- **零宿主改动**：iframe.src 走 src/file path 段 URL（auth.ts:36 免 token 放行，与 Excalidraw 同机制）。
- **跨域隔离**（SharedArrayBuffer 前提）：依赖 Pixelorama 自带 service worker（index.service.worker.js 第 44-60 行自动补 COOP/COEP 头）。
- **双向通信**：同源 iframe，父页面直接 `iframe.contentWindow` 调用 Godot eval 注册的全局函数；Godot 用 `JavaScriptBridge.eval` 调父页面注入的回调。COOP `same-origin` 不阻断同源访问。

### 二、改动清单

#### 1. 改 D:\Pixelorama 源码（加 JS 注入/回传桥）
**文件**：`D:/Pixelorama/src/Autoload/HTML5FileExchange.gd`

在 `_define_js()` 的 JS 字符串里**新增**（不动现有 upload_image 等）：
```js
// 父→Godot：父页面调此函数注入图片
window.__pixelorama = window.__pixelorama || {};
window.__pixelorama._pendingImages = [];   // 待注入队列
window.__pixelorama.loadImage = function(base64DataUrl, name) {
  window.__pixelorama._pendingImages.push({data: base64DataUrl, name: name || 'imported.png'});
};
window.__pixelorama._drain = function() {   // Godot 轮询调用
  var arr = window.__pixelorama._pendingImages;
  window.__pixelorama._pendingImages = [];
  return arr;
};
// Godot→父：父页面注册接收回调
window.__pixelorama.onReady = null;        // Godot 就绪后调用
window.__pixelorama.onExport = null;       // 导出时调用 (base64DataUrl, name)
```

在 GDScript 侧**新增方法**（HTML5FileExchange 是 Autoload 单例，全局可调）：
```gdscript
func _process(_delta) -> void:
    if OS.has_feature("web"):
        _poll_external_images()

var _polling := false
func _poll_external_images() -> void:
    if _polling: return
    _polling = true
    var arr = JavaScriptBridge.eval("window.__pixelorama._drain ? window.__pixelorama._drain() : []", true)
    _polling = false
    if arr == null or not arr is Array: return
    for item in arr:
        _import_one(item)  # item = {data, name}

func _import_one(item: Dictionary) -> void:
    var data_url: String = item.get("data", "")
    var name: String = item.get("name", "imported.png")
    # data:image/png;base64,xxxx → 去前缀取 base64 → PackedByteArray
    var comma_idx = data_url.find(",")
    var b64 = data_url.substr(comma_idx + 1) if comma_idx != -1 else data_url
    var buf = Marshapps.base64_to_raw(b64)  # 用 Marshalls.base64_to_raw
    var img = Image.new()
    var err = img.load_png_from_buffer(buf)
    if err == OK:
        OpenSave.handle_loading_image(name, img, false)
    # 通知父页面已处理（可选）

func notify_ready() -> void:
    JavaScriptBridge.eval("if(window.__pixelorama&&window.__pixelorama.onReady)window.__pixelorama.onReady()", true)

func export_to_parent(img: Image, name: String) -> void:
    var buf = img.save_png_to_buffer()
    var b64 = Marshalls.raw_to_base64(buf)
    var js = 'if(window.__pixelorama&&window.__pixelorama.onExport)window.__pixelorama.onExport("data:image/png;base64,%s","%s")' % [b64, name]
    JavaScriptBridge.eval(js, true)
```

在 `_ready()` 末尾调 `notify_ready()`（或加 timer 延迟，确保 JS bridge 已注入）。

#### 2. 重新导出 web 版
```bash
"/c/Program Files/Godot/Godot.exe" --headless --export-release "Web" "D:/Pixelorama_web/index.html"
```
（用 export_presets.cfg 的 preset name="Web"，export_path 自动是 ../Pixelorama_web/index.html）
- 导出产物覆盖 D:/Pixelorama_web（index.html/pck/wasm/service.worker.js 等）

#### 3. 部署到 game-asset-canvas vendor
复制 D:/Pixelorama_web 整目录到：
`game-asset-canvas/src/vendor/pixelorama-web/`（~44MB：index.wasm 37MB + index.pck 6.4MB）

#### 4. `src/utils/constants.js`（改）
- `NODE_TYPES` 加 `pixelEditor: 'pixelEditor'`
- `NODE_META` 加 `[NODE_TYPES.pixelEditor]: { label: '像素编辑器', icon: '👾', color: '#22c55e' }`
- `IMAGE_TAGS` 加 `pixelEditor: '像素'`

#### 5. `src/components/nodes/PixelEditorNode.jsx`（新增，仿 FrameEditorNode）
- 输入：FileUpload 多图（maxFiles=0）+ 上游连线多图，合并去重
- 渲染：FileUpload + 上游连线只读占位 + 输入统计 + 「👾 编辑像素」按钮 + ImageResult
- 按钮开 PixelEditorDialog，handleSave(urls) → onUpdate output

#### 6. `src/components/PixelEditorDialog.jsx`（新增，仿 FrameEditorDialog）
- Dialog 90vw×92vh，主体一个 iframe
- **iframe src**：自拼 path 段 URL（不能用 srcFileUrl 的 query 形式）：
  `{window.location.origin}/api/mini-apps/{projectId}/src/file/vendor/pixelorama-web/index.html`
  - projectId 从 srcFileUrl 解析（或从 window 配置取）
- **父→Godot 注入图片**（iframe onLoad 后）：
  1. 等 `iframe.contentWindow.__pixelorama.onReady` 或 onReady 回调触发（轮询 contentWindow.engines / window.__pixelorama 就绪，最长 30s，因 wasm 加载慢）
  2. 把每张输入图 URL → proxyImageUrl → fetch → blob → FileReader.readAsDataURL 拿 base64
  3. 逐张 `iframe.contentWindow.__pixelorama.loadImage(dataUrl, name)`（Godot _process 轮询 _drain 消费）
- **Godot→父 导出**：
  1. 顶部「导入到 Pixelorama」「从 Pixelorama 导出」两按钮
  2. 导出按钮 → `iframe.contentWindow.__pixelorama.requestExport()`（Godot 侧新增：遍历当前 project 帧，每帧 export_to_parent）
  3. 父页面 `onExport` 回调收 base64 → blob → uploadFile → 累积 urls
  4. 全部帧导出完 → onSave(urls) + onClose
- **错误兜底**：wasm 加载超时 / __pixelorama 未就绪 → 顶部红字（不崩溃）

#### 7. `src/components/Canvas.jsx`（改，与 frameEditor 对称，5 处）
NODE_COMPONENTS / ADD_NODE_ITEMS / computeInputImages.isReceiver / DEFAULT_SIZE / initialData / import

#### 8. `src/components/RightPanel.jsx`（改）
ADD_ITEMS 加 `{ type: NODE_TYPES.pixelEditor, label: '像素编辑器' }`

### 三、关键验证点（plan 标注的风险）
1. **🔴 最高风险：COOP/COEP 头**。Pixelorama 需 cross-origin isolated。依赖自带 SW 补头，但 SW 注册作用域能否覆盖宿主 src/file URL 未经实测。**验证步骤**：资源部署后，先单独用浏览器访问 iframe URL，看 console 是否报 `SharedArrayBuffer is not defined`。
   - **若失败，回退方案**：改 `packages/server/src/routes/mini-apps.ts` 的 src/file 路由，对 `.html/.wasm/.js` 响应加 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` 头（需重启 web，属宿主改动，会再向你确认）。
2. **🟡 Godot web 启动慢**：43MB wasm 加载需 5-30s，onReady 轮询超时设 30s。
3. **🟡 base64 大图**：单张图转 base64 可能数 MB，loadImage 队列分批传。
4. **🟢 同源通信**：iframe 同源，COOP same-origin 不阻断父-iframe 互访（仅跨域才阻断）。

### 四、验证步骤（手动验收）
1. 浏览器直接访问 iframe URL，确认 Pixelorama 启动（无 SharedArrayBuffer 报错）
2. 画布新增「像素编辑器」节点，连入多图，点「👾 编辑像素」
3. 对话框内 Pixelorama 加载完，上游图自动导入为新 tab/帧
4. 编辑后点「从 Pixelorama 导出」→ 节点产出图，可连线下游
5. 断网/超时不崩溃

### 五、执行顺序
1. 先改 GDScript + 导出（可独立验证 COOP/COEP 风险点 1）
2. 部署到 vendor
3. **风险点 1 验证**（决定是否需回退到宿主改动）
4. 通过后再写 React 节点/Dialog/constants 注册

### 六、后续优化（不在本次）
- 导出格式加 sprite sheet 拼接 / GIF（复用 encodeFramesToGif）
- fps / 画布参数暴露
- handoff.md / CLAUDE.md 更新