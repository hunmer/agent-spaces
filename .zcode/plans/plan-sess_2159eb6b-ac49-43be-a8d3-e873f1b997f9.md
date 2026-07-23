# FrameRonin 工具 → 画布节点（CDN 方案，零 web 依赖污染）

## 方案核心

宿主层只加 **1 个通用 CDN 模块加载能力**到 `window.AgentSpaces`，mini-app 自包含引用所有算法库。web 的 `package.json` 零改动。

### 为什么这样设计
- 用户要求不污染 web dependencies → 不能加 image-q/gifenc 等到 web
- `downloadZip` 已证明宿主层 `import()` 动态加载可行（use-mini-app-host-api.tsx:548）
- CDN URL 是变量 → 必须用 `/* webpackIgnore: true */` 注释让 webpack 完全放行，交给浏览器运行时 `import()`
- loader 通用化后，**任何 mini-app** 都能按需 CDN 加载任意 ESM 库，不止本画布

## 技术可行性（已验证）
- 浏览器原生 `import(cdnUrl)` 支持 ESM CDN（esm.sh/unpkg/jsdelivr）
- `webpackIgnore` 注释让 Next.js webpack 不静态分析该 import（标准用法）
- 目标库均为纯 JS ESM：`gifuct-js`/`gifenc`/`image-q`/`jszip`，esm.sh 有完整 ESM 转译
- React 19.2.4 同 minor 兼容

---

## 实施步骤

### 步骤 1：宿主层加 CDN loader（1 个文件）

**改 `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`：**

在 `pluginApi` 对象里（第 838-860 行附近）新增：
```ts
// 通用 CDN ESM 模块加载器：按 URL 缓存，mini-app 按需动态 import。
// webpackIgnore 让 Next.js 不静态分析此 import，交给浏览器运行时从 CDN 拉取。
const cdnCache = new Map<string, unknown>();
const loadCdnModule = async <T = unknown>(url: string): Promise<T> => {
  if (cdnCache.has(url)) return cdnCache.get(url) as T;
  const mod = await import(/* webpackIgnore: true */ url);
  const resolved = (mod as any)?.default !== undefined && Object.keys(mod).length === 1
    ? (mod as any).default  // CJS 互操作：只有 default 就解包
    : mod;
  cdnCache.set(url, resolved);
  return resolved as T;
};
```
然后把 `loadCdnModule` 加入 `pluginApi` 和最终的 `window.AgentSpaces` 挂载（第 838-860 行 pluginApi 对象 + 第 898 行 spread 已自动带上）。

> 注意：use-mini-app-host-api 改动属宿主层，**需重启 web 服务**生效（handoff.md 第 9 条）。

### 步骤 2：mini-app 新建算法库（`src/utils/image-ops/`）

从 FrameRonin 剥离，统一签名 `(inputImages: ImageData[], params) => ImageData[]`。

```
src/utils/image-ops/
  cdn.js          # CDN 库加载封装：export async function getGifEnc/getGifUct/getImageQ/getJsZip()
                  #   内部调 window.AgentSpaces.loadCdnModule(CDN_URL)，URL 常量集中在此
  io.js           # urlToImageData / imageDataToBlob / imageDataToDataUrl（统一 canvas I/O）
  gif.js          # 拆帧 compositeFrame + 编码 runFramesToGif（来自 GifFrameConverter.tsx:21,442）
  spriteSheet.js  # splitSpriteSheet + composeSpriteSheet + superSplitTransparent 检测部分
  pixelate.js     # processWithMesh + paletteImage + makeBackgroundTransparent + imageDataOps 全套
  matte.js        # chromaKeyCanvas + processDoubleBackground + 白底 CPU 版 erodeAlphaOnCanvas
  stroke.js       # resizeImageToBlobNearestNeighborPS + applyInnerStroke BFS + cropImageBlob
  compose.js      # composeFrameToImageData alpha-over 手写版
  index.js        # 汇总 + PROCESSORS 注册表（id→{label,category,params,run,multipleOut?}）
```

**CDN URL 常量**（集中在 `cdn.js`，用 esm.sh 稳定源）：
```js
const CDN = {
  gifEnc: 'https://esm.sh/gifenc@1.0.3',
  gifUct: 'https://esm.sh/gifuct-js@2.1.2',
  imageQ: 'https://esm.sh/image-q@4.0.0',
  jszip: 'https://esm.sh/jszip@3.10.1',
};
```

剥离原则（已核实可行）：
- 丢掉 antd/react，只留算法循环
- `document.createElement('canvas')+drawImage/getImageData/toBlob` 统一收口到 `io.js`
- opencv 相关全砍（mesh 用 `fallbackUniformMesh` 均匀网格兜底，FrameRonin 已有此兜底）
- `yieldToMain()` 移除

### 步骤 3：新增「图像处理」节点类型

**改 `src/utils/constants.js`：**
- `NODE_TYPES.imageProcess = 'imageProcess'`
- `NODE_META.imageProcess = { label:'图像处理', icon:'🔧', color:'#14b8a6' }`
- `IMAGE_TAGS.imageProcess = '图像处理'`
- 新增 `IMAGE_PROCESSORS` 常量（处理器清单，见下方）

**`IMAGE_PROCESSORS` 内容：**
```js
[
  { id:'gif-split', label:'GIF拆帧', category:'gif',
    params:[{key:'fps',label:'采样帧率',type:'number',default:8,min:1,max:30}],
    multipleOut:true, desc:'把 GIF 拆成多帧 PNG' },
  { id:'gif-merge', label:'GIF合成', category:'gif',
    params:[{key:'delay',label:'帧间隔ms',type:'number',default:100,min:20}] },
  { id:'sprite-split', label:'Sheet拆分', category:'sprite',
    params:[{key:'cols',label:'列数',type:'number',default:4},{key:'rows',label:'行数',type:'number',default:4},{key:'auto',label:'自动透明拆分',type:'bool',default:false}],
    multipleOut:true },
  { id:'sprite-merge', label:'Sheet合成', category:'sprite',
    params:[{key:'columns',label:'列数',type:'number',default:4},{key:'spacing',label:'间隔px',type:'number',default:0}] },
  { id:'pixelate', label:'像素化', category:'pixel',
    params:[{key:'numColors',label:'颜色数',type:'number',default:16,min:2,max:256},{key:'blockSize',label:'像素块',type:'number',default:4,min:1}] },
  { id:'chroma-key', label:'色度键抠图', category:'matte',
    params:[{key:'keyColor',label:'键色',type:'color',default:'#00ff00'},{key:'tolerance',label:'容差',type:'number',default:80},{key:'smoothness',label:'平滑',type:'number',default:30}] },
  { id:'white-key', label:'白底抠图', category:'matte',
    params:[{key:'tolerance',label:'容差',type:'number',default:30},{key:'erode',label:'侵蚀px',type:'number',default:0}] },
  { id:'resize-nearest', label:'最近邻缩放', category:'pixel',
    params:[{key:'targetW',label:'目标宽',type:'number',default:256},{key:'targetH',label:'目标高',type:'number',default:256}] },
  { id:'inner-stroke', label:'内描边', category:'pixel',
    params:[{key:'strokeWidth',label:'描边宽',type:'number',default:2,min:1,max:10},{key:'strokeColor',label:'描边色',type:'color',default:'#000000'}] },
  { id:'compose-overlay', label:'图层叠加', category:'compose',
    params:[{key:'mode',label:'混合模式',type:'select',options:['normal','multiply','screen'],default:'normal'}] },
]
```

**新建 `src/components/nodes/ImageProcessNode.jsx`：**
- 走 `NodeShell`（targetHandle + sourceHandle）
- 顶部下拉选处理器（按 category optgroup 分组）
- 下方动态渲染该处理器 params 表单（支持 number/color/select/bool）
- 「执行」按钮 → `data.onProcessLocal(processorId, params)`
- 产出多帧（multipleOut=true）时展示网格缩略图，复用 ImageResult 组件

### 步骤 4：Canvas 接入

**改 `src/components/Canvas.jsx`：**
- `NODE_COMPONENTS` 注册 `ImageProcessNode`
- `ADD_NODE_ITEMS` 加该类型
- `initialData('imageProcess')` 返回 `{ status, output:{images:[]}, params:{ processor:'pixelate', processorParams:{} } }`
- 新增 `handleProcessLocal(nodeId, processorId, params, sourceImages)`：
  1. 取输入图（computeInputImages 已派生连线输入）
  2. `urlToImageData` 转 ImageData（async）
  3. 调 `PROCESSORS[processorId].run(imageDataList, params)`（async，内部按需 CDN load）
  4. `imageDataToBlob` → `window.AgentSpaces.uploadFile` 拿 URL
  5. 回填 `data.output.images` + 状态 done/error
  6. 写 addHistory（model 字段填 processorId）
- `decoratedNodes` 注入 `onProcessLocal: handleProcessLocal`

**改 `src/components/RightPanel.jsx`：** 新增节点 tab 列表加「图像处理」项。

### 步骤 5：文档同步
- `src/CLAUDE.md`：加「图像处理节点」章节（节点类型/处理器清单/CDN 加载机制/onProcessLocal 注入）
- `src/handoff.md`：加「FrameRonin 工具移植」章节（loadCdnModule 能力/image-ops 目录/CDN URL 清单）

---

## 连线与数据流（零额外改动）

- ImageProcessNode 有 target/source handle → 自动接入 `computeInputImages`（Canvas.jsx:50）
- 上游图（文生图/编辑/展示/另一处理节点）连线 → 自动作为输入
- 产出 `data.output.images` → 下游自动派生
- NodeToolbar 的「导出图片」按钮自动可用

---

## 范围（明确不做）

- 不做精细画笔/橡皮（ImageMatte 精细模式）
- 不做 Sprite Sheet 调整的拖拽重排/帧勾选/动画预览（交互密集，与纯参数节点冲突）
- 不做光流插帧（依赖 opencv，CDN 也加载不了 WASM）
- 不做 node_modules 全链路改造

---

## 验收

1. 重启 web 后，画布右键/新增节点 tab 能看到「图像处理」节点
2. 上传绿幕图 → 连线到图像处理节点 → 选「色度键抠图」→ 执行 → 产出透明背景图
3. 上传 GIF → 连线 → 选「GIF拆帧」→ 执行 → 产出多帧 PNG 网格
4. 多张图连线到「图层叠加」→ 执行 → 合成一张
5. 产出图可继续连线到下游文生图/编辑节点
6. 断网时：节点提示「CDN 加载失败」，不影响其他功能

---

## 风险与回退

- **风险 1：esm.sh 转译某库失败**（如 image-q 的 wuquant 子模块）→ 回退到 jsdelivr 的 `.mjs` 或换 unpkg；最坏情况该处理器降级（如色彩量化改自写 median-cut）
- **风险 2：`webpackIgnore` 注释在 Next.js turbopack 模式下不被识别** → fallback 用 `new Function('u','return import(u)')(url)` 绕过打包器静态分析
- **风险 3：CDN 跨域/CSP 拦截** → 宿主 `next.config.ts` 无 CSP 头，浏览器原生 import 跨域允许（CORS 由 CDN 侧 esm.sh 设置），实测应无问题
- **回退**：loadCdnModule 是独立能力，算法移植受阻可只回退 image-ops 目录而不影响现有画布功能