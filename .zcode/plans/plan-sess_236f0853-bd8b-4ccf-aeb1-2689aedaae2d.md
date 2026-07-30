# 视频编辑器节点实现方案

## 总览
新增【视频编辑器】节点，支持多视频上传/上游接收、按帧率截取、帧拖拽到动画组（起止帧循环播放）、视频尺寸调整。涉及三层改动：

1. **服务端（打通断点 + ffmpeg 插件）**——需重启 web
2. **mini-app 节点组件 + 工具函数**——刷新即生效
3. **manifest 声明插件**

---

## 一、服务端改动（需重启 web）

### 1.1 打通 workspaceId → 插件 api 的断点

**问题**：`routes/plugin.ts:187` 调 `executePluginTool` 时传 `createBuiltinPluginApi()`（无 workspaceId），导致 ffmpeg 拿不到 miniapp 的 data 目录。

**改动文件**：

**`packages/server/src/services/plugin-runtime-api.ts`**（createBuiltinPluginApi）：
- `PluginSource` 类型扩展可选 `workspaceId?: string`
- 新增 `getMiniAppDataDir()`：从 `../services/mini-apps.js` 导入 `resolveDataPath`，返回 `resolveDataPath(workspaceId, 'data')` 绝对路径（workspaceId 缺失时返回 null）
- 新增 `saveMiniAppDataFile(relPath, buffer)`：调 `writeDataFile`（mini-app-store）落盘到 `<dataDir>/data/<relPath>`，返回 `{ path: 'data/<rel>', httpPath }`（httpPath 由服务端按 origin 拼接 `/api/mini-apps/<id>/data/file?path=...`）

**`packages/server/src/routes/plugin.ts:187`**：
```js
// 改前
createBuiltinPluginApi()
// 改后
createBuiltinPluginApi({ workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined })
```
（workspaceId 在 :139 已从 req.body 解构，只需透传）

**`packages/server/src/services/plugin.ts:1160`**（executePluginTool handler）：
确认 `createPluginActions(actions).tools().handler(name, mergedArgs, { ...api, config })` 中 `api` 已含 workspaceId（由 routes 传入，无需再改）。

### 1.2 ffmpeg 插件新增 2 个 action

**改两份副本**（templates 模板 + agent-spaces-data 已安装）：
- `packages/templates/plugins/ffmpeg/actions.js`
- `packages/server/agent-spaces-data/plugins/ffmpeg/actions.js`

#### action A: `ffmpeg_extract_frames`（按帧截取）
```js
{
  name: 'ffmpeg_extract_frames',
  label: '按帧截取',
  category: 'FFmpeg',
  tool: false,
  properties: [
    { key: 'inputPath', type: 'text', required: true },     // 视频 URL 或本地路径
    { key: 'mode', type: 'select', default: 'count',        // count=固定数量 / fps=按帧率
      options: [{label:'按数量',value:'count'},{label:'按帧率',value:'fps'}] },
    { key: 'count', type: 'number', default: 8 },            // mode=count 时
    { key: 'fps', type: 'number', default: 1 },              // mode=fps 时
    { key: 'maxWidth', type: 'number', default: 320 },       // 缩略图宽度（等比缩放）
  ],
  outputs: [
    { key: 'success', type: 'boolean' },
    { key: 'data', type: 'object', children: [
      { key: 'frames', type: 'array' },        // http URL 数组
      { key: 'frameCount', type: 'number' },
      { key: 'dir', type: 'string' },          // 相对 data/ 的目录路径
    ] },
  ],
  run: async (ctx, args) => {
    const ffmpeg = require('@ts-ffmpeg/fluent-ffmpeg')
    const dataDir = ctx.api.getMiniAppDataDir?.()
    // 生成 id
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const outDir = path.join(dataDir, 'video-frames', id)
    await ctx.api.createDir(outDir, { recursive: true })
    // 截帧：ffmpeg screenshots 按 count 或 timemarks
    const cmd = ffmpeg(inputPath)
    if (maxWidth) cmd.size(`?x${maxWidth}`)  // 等比，? 表示自动
    // mode=fps: 用 outputOptions('-vf fps=<fps>')
    await new Promise((resolve,reject) => {
      cmd.on('end', resolve).on('error', reject)
         .screenshots({ count, folder: outDir, filename: 'frame-%i.jpg' })
    })
    // 读目录收集帧文件，排序，转成 data 相对路径 → httpPath
    const files = (await ctx.api.listFiles(outDir)).filter(f=>f.type==='file').sort()
    const frames = files.map(f => {
      const rel = path.relative(dataDir, f.path)  // video-frames/<id>/frame-1.jpg
      return ctx.api.saveMiniAppDataFile?.(rel, fs.readFileSync(f.path))?.httpPath
        ?? `${origin}/api/mini-apps/<id>/data/file?path=${rel}`
    })
    return { success: true, data: { frames, frameCount: frames.length, dir: `video-frames/${id}` } }
  }
}
```

#### action B: `ffmpeg_custom`（自定义命令——用户明确要求）
```js
{
  name: 'ffmpeg_custom',
  label: '自定义FFmpeg命令',
  category: 'FFmpeg',
  tool: false,
  properties: [
    { key: 'inputPath', type: 'text', required: true },
    { key: 'args', type: 'text', required: true },   // ffmpeg 参数字符串，如 "-vf scale=640:-1 -c:a copy"
    { key: 'outputExt', type: 'text', default: 'mp4' }, // 输出扩展名
  ],
  outputs: [
    { key: 'success', type: 'boolean' },
    { key: 'data', type: 'object', children: [
      { key: 'httpPath', type: 'string' },
      { key: 'dir', type: 'string' },
    ] },
  ],
  run: async (ctx, args) => {
    // 用 fluent-ffmpeg 或直接 spawn ffmpeg 进程执行 args
    // 输出到 <dataDir>/video-output/<id>.<ext>
    // saveMiniAppDataFile 转 httpPath 返回
  }
}
```

---

## 二、mini-app 改动（刷新即生效）

### 2.1 constants.js（单一数据源）
- `NODE_TYPES` 加 `videoEditor: 'videoEditor'`
- `NODE_META` 加 `{ label: '视频编辑器', icon: '🎬', color: '#8b5cf6' }`
- `IMAGE_TAGS`/接收上游逻辑：videoEditor 是 receiver（接收视频）

### 2.2 canvas-constants.js
- `NODE_COMPONENTS` 注册 `VideoEditorNode`
- `ADD_NODE_ITEMS` 加菜单项（分组：视频类）
- `DEFAULT_SIZE`：`videoEditor: { width: 720, height: 520 }`（编辑器需要较大空间）
- `initialData`：`{ videos: [], frames: [], animGroups: [], params: { fps: 1, count: 8 } }`
- `computeInputImages.isReceiverType`：videoEditor 接收视频 URL

### 2.3 api.js + tools.js
- `VALID_NODE_TYPES` / `NODE_LABELS` 加 videoEditor
- `NODE_TYPE_ENUM` / `NODE_TYPE_DESC` 加 videoEditor
- **不接入 Agent RPC**（用户选择「暂不接入」），所以 `useCanvasAgentRpc` 的 `GENERATABLE` Set 不加

### 2.4 RightPanel.jsx
- `ADD_ITEMS` 加视频编辑器卡片

### 2.5 核心新增：`components/nodes/VideoEditorNode.jsx`
节点外壳 + 「打开编辑器」按钮。点击打开大对话框（仿 ImageEditorNode 模式 A）。

**data 结构**（持久化到节点）：
```js
{
  videos: string[],           // 视频 http URL（上传/上游）
  frames: string[],           // 截取的帧 http URL
  framesDir: string,          // data 目录相对路径（用于清理）
  animGroups: [{              // 动画组
    id, name,
    frames: [frameUrl,...],   // 该组包含的帧（拖入的）
    startFrame: number,       // 起始帧索引（相对 frames）
    endFrame: number,         // 结束帧索引
    fps: number,              // 播放帧率
  }],
  params: { fps, count, maxWidth },
  videoInfo: { duration, width, height, frameRate }, // 探测信息
}
```

### 2.6 核心新增：`components/VideoEditorDialog.jsx`（大对话框）
布局（严格遵守用户规格）：
```
┌─────────────────────────────────────────────┐
│ [视频1][视频2][视频3]... ←横向缩略图列表      │  顶栏
├──────────────────────────┬──────────────────┤
│                          │ [编辑][动画组]    │ tabs
│      视频播放器           │ ─────────────    │
│   <video controls>       │  右侧面板内容     │
│                          │                   │
├──────────────────────────┤                   │
│ [帧1][帧2][帧3]...        │                   │
│  横向帧数图片列表          │                   │
│  每帧右上角 ⋮ dropdown    │                   │
└──────────────────────────┴──────────────────┘
```

**组件拆分**：
- `VideoEditorDialog.jsx` — 主容器（Dialog + 布局 + data 持久化）
- `VideoThumbnailStrip.jsx` — 顶部视频缩略图列表（可上传/切换/删除）
- `VideoPlayer.jsx` — 视频播放器（`<video controls>`）
- `FrameStrip.jsx` — 横向帧图片列表 + 每帧 dots dropdown（【设置为起点】【设置为终点】+ 子菜单分组列表）
- `AnimationGroupPanel.jsx` — 动画组 tab（创建/编辑/删除分组 + Canvas 逐帧循环播放器）
- `EditPanel.jsx` — 编辑 tab（尺寸调整 + 视频信息展示 + 截帧参数）
- `FramePlayer.jsx` — Canvas 逐帧渲染播放器（requestAnimationFrame 按 fps 切换 ImageBitmap）

**Canvas 逐帧播放器核心逻辑**（用户选择「Canvas 逐帧渲染」）：
```js
function FramePlayer({ frames, startFrame, endFrame, fps }) {
  const canvasRef = useRef()
  const bitmapsRef = useRef([])  // 预加载 ImageBitmap
  // end < start → 显示错误信息，不播放
  if (endFrame < startFrame) return <div className="text-red-500">错误：结束帧 < 起始帧</div>
  // requestAnimationFrame 按 1000/fps 间隔切换 bitmap 绘制
  // 循环区间 [startFrame, endFrame]
}
```

**截帧调用**（EditPanel 里点「截取帧」）：
```js
const AS = window.AgentSpaces
const ret = await AS.callPluginTool('workflow.ffmpeg', 'ffmpeg_extract_frames', {
  inputPath: currentVideo,
  mode: params.mode,
  count: params.count,
  fps: params.fps,
  maxWidth: params.maxWidth,
})
// ret.data.frames 是 http URL 数组
onUpdate({ frames: ret.data.frames, framesDir: ret.data.dir })
```

**拖拽到动画组**：FrameStrip 的帧设 `draggable`，AnimationGroupPanel 的分组区域 `onDrop` 接收 frameUrl，加入该组 frames。

---

## 三、manifest.json 声明插件

`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/manifest.json`：
```json
"enabledPlugins": [
  "@agent-spaces/builtin",
  "workflow.rembg",
  "workflow.ffmpeg"    // 新增
]
```

---

## 四、执行顺序

1. **服务端**：打通 workspaceId 断点 + ffmpeg 加 2 个 action（templates + 已安装两份）→ **重启 web**
2. **manifest**：加 `workflow.ffmpeg`
3. **mini-app 注册**：constants.js + canvas-constants.js + api.js + tools.js + RightPanel.jsx
4. **节点组件**：VideoEditorNode.jsx + VideoEditorDialog.jsx + 子组件
5. 刷新验证

---

## 五、关键约束遵守（来自 handoff）
- 节点创建带 `width/height` + `style`（NodeResizer 有效）
- 对话框内容加 `nodrag nopan nowheel`
- 视频上传用 `window.AgentSpaces.uploadFile`（不用 createObjectURL）
- 产物走 data 目录（不用 savePublicFile 全局 uploads）
- 枚举参数 options 引用 constants（单一数据源）
- 图标从 `@agent-spaces/ui` 命名导入
- 业务数据存 `data.xxx`（经 onUpdate 写回），不只放 Dialog useState

## 六、不在本次范围
- Agent RPC 接入（用户选择暂不做）
- 预合成 WebM/GIF 导出
- 多视频拼接

## 验收步骤
1. 重启 web 后，画布右键/面板新增「视频编辑器」节点
2. 上传一个视频 → 点「打开编辑器」
3. 编辑 tab 点「截取帧」→ 底部出现帧图片列表
4. 拖一帧到动画组 → 设起止帧 → Canvas 循环播放
5. 结束帧 < 起始帧 → 显示错误不播放
6. 帧右上角 ⋮ → 设置为起点/终点 → 选分组