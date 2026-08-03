# Handoff: 视频编辑器节点 (videoEditor)

> 本文件是 videoEditor 节点的索引型交接文档：快速理解实现骨架 + 修改某功能去哪个文件。
> 通用约定（节点注册/数据流/约束）查 `src/handoff.md`，本文只记录 videoEditor 专属内容。

## 节点一句话
视频编辑器节点：接收上游或上传多个视频 → 可框选区域 → ffmpeg 按全部原始帧/帧间隔/秒间隔/数量/帧率输出原分辨率无损 PNG → 选择起止帧并预览动画 → 创建动画组/输出精灵图 → 调整视频尺寸与查看信息。

## 关键文件

```
mini-app 根: packages/server/agent-spaces-data/mini-apps/game-asset-canvas/
  src/
    components/
      VideoEditorDialog.jsx        # 大对话框（双播放器/帧选区/动画组/编辑面板）
      FrameSequencePlayer.jsx      # 通用帧序列播放器（React 状态 + img + 本地计时器）
      FrameSequencePlayer.test.js # React 内置播放器计时器与清理测试
      nodes/
        VideoEditorNode.jsx        # 节点外壳（摘要 + 打开编辑器按钮 + 缩略图预览）
        FramePlayer.jsx            # FrameSequencePlayer 兼容导出
    utils/
      constants.js                 # NODE_TYPES.videoEditor + NODE_META + FRAME_EXTRACT_MODE_OPTIONS
      canvas-constants.js          # NODE_COMPONENTS 注册 + ADD_NODE_ITEMS + DEFAULT_SIZE + initialData
      frame-selection.js           # 选区归一化 + 单击/组合键边界更新纯函数
      frame-selection.test.js      # 选区交互回归测试
      video-crop.js                # 视频框选坐标归一化与最小选区规则
      video-crop.test.js           # 区域截取纯函数测试
      video-frame-extraction.test.js # 无损 PNG、crop 参数和常驻挂载契约测试
      input-images.js              # VIDEO_RECEIVER_TYPES / VIDEO_PASSTHROUGH_TYPES 含 videoEditor
      api.js                       # VALID_NODE_TYPES / NODE_LABELS 含 videoEditor
      tools.js                     # NODE_TYPE_ENUM / NODE_TYPE_DESC 含 videoEditor
    hooks/
      useDecoratedNodes.js         # videoEditor 上游视频派生（合并非覆盖，~70 行）
  manifest.json                    # enabledPlugins 含 "workflow.ffmpeg"

ffmpeg 插件（两份副本需同步！见下「ffmpeg 插件」）:
  packages/templates/plugins/ffmpeg/frames.js      # 模板源
  packages/server/agent-spaces-data/plugins/ffmpeg/frames.js  # 运行时副本
```

## 数据结构（节点 data）

```js
{
  videos: string[],        // 视频 http URL（上传 + 上游派生，由 computeInputVideos 合并）
  source: 'upload'|'upstream',  // 来源标记（useDecoratedNodes 设置）
  frames: string[],        // 截取的帧 http URL
  framesDir: string,       // 帧文件在 data 目录的相对路径
  frameSelection: {startFrame:number,endFrame:number}|null, // 当前帧选区
  framePreviewFps: number, // 主帧预览播放速度
  animGroups: [{           // 动画组
    id, name,
    frames: string[],      // 创建时的完整帧源快照；旧数据为空时回退全局 frames
    startFrame: number,    // 起始帧索引（相对 frames 全集）
    endFrame: number,      // 结束帧索引
    fps: number,           // 播放帧率
    cropRegion: object|null, // 创建时的归一化裁切区域元数据
  }],
  videoInfo: object|null,  // ffprobe 解析信息
  params: { mode, count, fps, interval, secondsInterval, cropEnabled, cropRegion }, // cropRegion 为 0..1 归一化选区
  sheetLayout: { rows, cols },  // 精灵图输出网格布局
  output: { video: string|null, images: string[] },  // video=尺寸调整产出；images=精灵图输出（下游消费）
}
```

## 布局（VideoEditorDialog）

```
┌─────────────────────────────────────────────┐
│ 标题栏 + busy 指示                            │
├─────┬──────────────────────┬────────────────┤
│ 左  │                      │ [编辑][动画组]  │ tabs
│ 侧  │ [视频播放器][帧预览]   │ ─────────────  │
│ 栏  │   主播放器区域         │ 右侧面板内容    │
│ 视  ├──────────────────────┤                │
│ 频  │ [起点][终点][+动画组]  │                │
│ 列  │  多行帧图片列表 + 滚动  │                │
│ 表  │ 单击起点 / 组合键终点  │                │
│ +上 │                      │                │
│ 传  │                      │                │
└─────┴──────────────────────┴────────────────┘
```

- **视频缩略图列表属于左侧栏**（`<aside>`，纵向排列），不再占整行顶栏 / 不出现在右侧面板上方。FileUpload 在左侧栏顶部。
- 视频缩略图：用 `ffmpeg_first_frame` 获取首帧 base64（不用 `<video>`）
- FileUpload 用内联 `<style>` + `.video-thumb-upload` class 缩成缩略图尺寸（参考 GroupExecutionToolbar）
- 帧列表单击设置当前起点，Ctrl/Command + 单击设置当前终点；当前区间高亮并用于主帧预览。
- 帧列表 header 可直接输入起点/终点；最右侧图标按钮按当前范围创建动画组并自动切到「动画组」tab。
- 帧缩略图使用多行自适应网格，列表区域超过 240px 后纵向滚动。
- 「新建动画组」直接使用当前选区创建，不再通过帧缩略图 ⋮ 菜单写入已有组。
- 拆帧成功后选区初始化为 `0..frames.length-1`，并自动切到「帧预览」。
- 普通单击若新起点超过旧终点，会同时把终点移动到该帧；Ctrl/Command + 单击只更新终点。
- 终点小于起点时帧播放器显示错误，且「新建动画组」禁用。
- 切换视频时清空 `frames/framesDir/frameSelection/animGroups/videoInfo`，并切回「视频播放器」。
- 主播放器 tab (`previewTab`) 是 Dialog 本地展示态；选区与预览 FPS 分别持久化在 `data.frameSelection` / `data.framePreviewFps`。
- 视频播放器与帧预览始终保持挂载，切 tab 只切换可见性；隐藏时暂停、再次显示时保留原播放位置。
- 编辑 tab 的「区域截取」开启后会自动切到视频播放器；在画面拖拽框选，选区以归一化坐标持久化到 `data.params.cropRegion`。
- 区域截取开启时视频暂停并隐藏原生 controls；框选宽或高小于画面 1% 时视为无效。

### 动画组 tab（精灵图输出）
- 顶部「精灵图布局」：行（rows）/ 列（cols）输入，持久化到 `data.sheetLayout`。
- 「新建动画组」复制当前 `frameSelection`、`framePreviewFps`、裁切元数据和完整帧源；后续重新抽取其他裁切区域不会覆盖已有组。
- 每个动画组下方有「精灵图预览」（`GroupSheetPreview` 组件）：按起止帧取帧 → `composeSpriteSheet` 合成 → `imageDataToDataUrl` 展示。依赖起止帧/fps/cols 变化时刷新（切 fps 也会重算）。
- 列表最下方【输出到画布】按钮：把每个有效动画组合成精灵图 → `imageDataToUrl` 上传 → 收集 URL 写入 `data.output.images`（节点统一输出约定，下游图片节点据此消费）。
- sheet 合成能力复用 `utils/image-ops/spriteSheet.js` 的 `composeSpriteSheet`（同 sprite-merge 处理器），URL↔ImageData 用 `utils/image-ops/io.js`。

## ffmpeg 插件（7 个 action）

| action | 用途 | 输入 | 输出 |
|---|---|---|---|
| ffmpeg_probe | 解析视频信息 | inputPath | format/video/audio/streams/duration |
| ffmpeg_extract_frames | 截取帧 | inputPath, mode(all/interval/seconds/count/fps), interval, secondsInterval, count, fps, cropRegion | frames[](httpPath), dir |
| ffmpeg_first_frame | 取首帧 base64 | inputPath | dataUrl(data:image/png;base64,...) |
| ffmpeg_custom | 自定义命令（尺寸调整） | inputPath, args, outputExt | httpPath, dir |
| ffmpeg_format_convert | 格式转换 | inputPath, outputFormat | outputPath |
| ffmpeg_merge | 音视频合并 | videoPath, audioPath | outputPath |
| ffmpeg_demux | 音视频分离 | inputPath, mode | audioPath/videoPath |

### ⚠️ 两份副本必须同步
改 `packages/templates/plugins/ffmpeg/` 后**必须同步**到 `packages/server/agent-spaces-data/plugins/ffmpeg/`（运行时实际加载的副本）。验证：
```bash
diff packages/templates/plugins/ffmpeg/frames.js packages/server/agent-spaces-data/plugins/ffmpeg/frames.js
```

### 路径规整（resolveInputPath）
`/static/uploads/xxx` 相对 URL 由 `plugin-runtime-api.ts` 的 `resolveInputPath` 补全为 `http://<serverOrigin>/static/xxx`，交给 ffmpeg 走 http 拉取（不依赖 public 目录磁盘布局）。所有 action 的 run 开头调 `ctx.api.resolveInputPath(inputPath)`。

### 截帧实现要点（frames.js）
- 直接 spawn ffmpeg 进程（`child_process.execFile`），绕过 fluent-ffmpeg screenshots API 的怪异行为
- all 模式：不加 fps 采样滤镜，使用 `-vsync 0` 输出全部解码帧
- interval 模式：`select=not(mod(n\,N))` 按解码帧序号每 N 帧取一张，并用 `-vsync 0` 避免补帧
- seconds 模式：把秒数间隔 N 换算为 `fps=1/N`，按时间均匀抽帧
- count 模式：探测 duration → 算 `fps = count / (duration × 0.95)` → 用 fps 滤镜（留 5% 余量避免末尾 EOF）
- count=1：取中点单帧 seek
- fps 模式：`-vf fps=N` 滤镜
- 所有模式输出原分辨率无损 PNG，不再默认缩放到 320px，也不使用 JPEG `-q:v` 质量参数。
- 区域截取开启时把归一化选区转换为 `crop=iw*w:ih*h:iw*x:ih*y`，并与采样滤镜组成同一条 `-vf` 链。
- 产物落 mini-app data 目录（`getMiniAppDataDir` + `saveMiniAppDataFile`），返回 httpPath

### 模式与参数

| mode | UI | 参数 | 语义 |
|---|---|---|---|
| `all` | 全部原始帧 | - | 输出全部解码帧 |
| `interval` | 每 N 帧抽取 | `interval >= 1` | 按源帧序号每 N 帧取一张 |
| `seconds` | 每 N 秒抽取 | `secondsInterval >= 0.01` | 按时间间隔均匀采样，支持小数秒 |
| `count` | 按数量 | `count >= 1` | 在全片均匀取得目标数量 |
| `fps` | 按帧率 | `fps >= 0.1` | 每秒抽取 N 张 |

## 服务端改动（需重启 web）

### workspaceId → 插件 api 断点
- `plugin-runtime-api.ts`：`PluginSource` 加 `workspaceId?`，新增 `getMiniAppDataDir()` / `saveMiniAppDataFile(relPath, buffer)` / `resolveInputPath(inputPath)`
- `routes/plugin.ts:~187`：透传 workspaceId 给 `createBuiltinPluginApi({ workspaceId })`
- `getMiniAppDataDir` 传 `'.'`（非空字符串，否则 safeProjectSubdirPath 抛 Invalid file path）

## 通用帧播放器（FrameSequencePlayer.jsx）
- 直接使用 React state、`<img>` 和组件内 `setInterval` 播放，不依赖 iframe、`srcFileUrl` 或 dynamic import。
- 支持播放/暂停、循环开关、帧滑杆、当前绝对帧号、循环区间与可选 FPS 修改；关闭循环后在终点暂停，再次播放从起点开始。
- frames/区间变化时回到起始帧；播放状态或 FPS 变化时重建计时器，组件卸载时 `clearInterval()`。
- 旧 `vendor/fast-image-sequence/` 文件仅为历史遗留，播放器运行时不再引用。
- `components/nodes/FramePlayer.jsx` 只保留兼容 re-export，新代码直接引用 `components/FrameSequencePlayer.jsx`。

## 状态流

```text
data.params.cropEnabled
  → data.params.cropRegion（0..1 归一化坐标）
  → ffmpeg_extract_frames
  → crop filter（启用且有有效选区时）
  → 原分辨率无损 PNG frames
  → data.frames + data.framesDir
  → data.frameSelection = {startFrame: 0, endFrame: last}
  → 帧列表点击更新 frameSelection
  → 主 FrameSequencePlayer 实时预览当前区间
  → 新建动画组复制 frameSelection + framePreviewFps + frames 快照
  → groupFrames(group) 优先从 group.frames 派生闭区间帧，旧组回退 data.frames
  → FrameSequencePlayer 播放 / composeSpriteSheet 输出精灵图
```

**约束：**
- `frameSelection` 是节点业务数据，必须经 `onUpdate` 持久化，不能只放 Dialog state。
- `resolveFrameSelection` 负责旧数据缺省、非法值和越界索引；不要在 JSX 内重复实现边界规则。
- Command 键必须检查 `event.metaKey`，同时保留 Windows/Linux 的 `event.ctrlKey`。
- 帧 URL 可能重复，帧缩略图 key 继续使用 `url + index`，不能只用 URL。
- `cropRegion` 的 `x/y/width/height` 都使用 `0..1` 归一化坐标；框选宽或高小于 `0.01` 时不提交选区。
- 区域截取模式开启时必须暂停视频并隐藏原生 controls，关闭后恢复 controls。
- 视频播放器与帧预览不能随 tab 条件卸载；只切换显隐并用 `active` 暂停隐藏播放器，避免切 tab 重载内容。
- 动画组派生数组必须保持引用稳定；精灵图只在源帧、组起止帧、组 FPS 或列数变化时重算，不能被播放进度触发。

## 已知问题 / 待办
1. **删除按钮不显示**（当前未解决）：视频缩略图右上角删除按钮始终不显示。已尝试 group-hover / opacity / hoveredVideo state / 始终渲染，均无效。canDelete 判断从 uploadedVideoUrls 改为 `data.source !== 'upstream'` 后用户反馈仍不行。下次排查建议：先用浏览器检查元素确认 `<button>` 是否在 DOM 中。
2. **缩略图缓存未持久化**：thumbs state 存在 Dialog/Node 组件内，刷新丢失，每次重新获取首帧。
3. **未接入 Agent RPC**：useCanvasAgentRpc 的 GENERATABLE Set 未加 videoEditor（用户选择暂不接入）。

## 修改路径速查

| 要改的功能 | 去哪个文件 |
|---|---|
| 对话框布局/交互 | `components/VideoEditorDialog.jsx` |
| 节点本体外观 | `components/nodes/VideoEditorNode.jsx` |
| 帧播放器 | `components/FrameSequencePlayer.jsx` |
| 帧选区规则/测试 | `utils/frame-selection.js` + `utils/frame-selection.test.js` |
| 视频区域框选/测试 | `components/VideoEditorDialog.jsx` + `utils/video-crop.js` + `utils/video-crop.test.js` |
| 无损截帧/crop 参数契约测试 | `utils/video-frame-extraction.test.js` |
| 播放器常驻/计时器测试 | `components/FrameSequencePlayer.test.js` |
| 截帧/首帧/尺寸调整逻辑 | ffmpeg 插件 `frames.js`（两份同步） |
| 节点注册 | `constants.js` + `canvas-constants.js` + `api.js` + `tools.js` |
| 上游视频派生 | `hooks/useDecoratedNodes.js` + `utils/input-images.js` |
| 插件路径规整 | `plugin-runtime-api.ts`（resolveInputPath） |

## 验证速查

```bash
# 选区交互纯函数
node --test packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/frame-selection.test.js

# 播放器常驻、区域框选与无损截帧契约
node --test packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/FrameSequencePlayer.test.js packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/video-crop.test.js packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/video-frame-extraction.test.js

# JSX 语法（逐个文件执行）
node -e "require('@babel/core').transformFileSync('文件.jsx',{presets:['@babel/preset-react']})"

# ffmpeg 两份副本一致性
diff packages/templates/plugins/ffmpeg/frames.js packages/server/agent-spaces-data/plugins/ffmpeg/frames.js

git diff --check
```

## Suggested Skills
- handoff（继续交接）
- write-mini-app-code（改 mini-app 前必读）
