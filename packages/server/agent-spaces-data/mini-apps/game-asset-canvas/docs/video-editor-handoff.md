# Handoff: 视频编辑器节点 (videoEditor)

> 本文件是 videoEditor 节点的索引型交接文档：快速理解实现骨架 + 修改某功能去哪个文件。
> 通用约定（节点注册/数据流/约束）查 `src/handoff.md`，本文只记录 videoEditor 专属内容。

## 节点一句话
视频编辑器节点：接收上游或上传多个视频 → ffmpeg 导出全部原始帧或按帧率/数量截取帧图片 → 帧分组（起止帧循环播放）→ 调整尺寸/查看视频信息。

## 关键文件

```
mini-app 根: packages/server/agent-spaces-data/mini-apps/game-asset-canvas/
  src/
    components/
      VideoEditorDialog.jsx        # 大对话框（播放器/帧列表/动画组/编辑面板），~750 行
      FrameSequencePlayer.jsx      # 通用帧序列播放器（fast-image-sequence React 包装）
      nodes/
        VideoEditorNode.jsx        # 节点外壳（摘要 + 打开编辑器按钮 + 缩略图预览）
        FramePlayer.jsx            # FrameSequencePlayer 兼容导出
    utils/
      constants.js                 # NODE_TYPES.videoEditor + NODE_META + FRAME_EXTRACT_MODE_OPTIONS
      canvas-constants.js          # NODE_COMPONENTS 注册 + ADD_NODE_ITEMS + DEFAULT_SIZE + initialData
      input-images.js              # VIDEO_RECEIVER_TYPES / VIDEO_PASSTHROUGH_TYPES 含 videoEditor
      api.js                       # VALID_NODE_TYPES / NODE_LABELS 含 videoEditor
      tools.js                     # NODE_TYPE_ENUM / NODE_TYPE_DESC 含 videoEditor
    vendor/
      fast-image-sequence/         # @mediamonks/fast-image-sequence@2.2.0 CDN dist
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
    frames: string[],      // 该组包含的帧 URL
    startFrame: number,    // 起始帧索引（相对 frames 全集）
    endFrame: number,      // 结束帧索引
    fps: number,           // 播放帧率
  }],
  videoInfo: object|null,  // ffprobe 解析信息
  params: { mode, count, fps, interval, secondsInterval, maxWidth },  // 截帧参数
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
│ 频  │ [帧1][帧2][帧3]...    │                │
│ 列  │  横向帧图片列表        │                │
│ 表  │ 单击起点 / 组合键终点  │                │
│ +上 │                      │                │
│ 传  │                      │                │
└─────┴──────────────────────┴────────────────┘
```

- **视频缩略图列表属于左侧栏**（`<aside>`，纵向排列），不再占整行顶栏 / 不出现在右侧面板上方。FileUpload 在左侧栏顶部。
- 视频缩略图：用 `ffmpeg_first_frame` 获取首帧 base64（不用 `<video>`）
- FileUpload 用内联 `<style>` + `.video-thumb-upload` class 缩成缩略图尺寸（参考 GroupExecutionToolbar）
- 帧列表单击设置当前起点，Ctrl/Command + 单击设置当前终点；当前区间高亮并用于主帧预览。
- 「新建动画组」直接使用当前选区创建，不再通过帧缩略图 ⋮ 菜单写入已有组。
- 切换视频时清空 frames/animGroups/videoInfo（useEffect 监听 currentVideo）

### 动画组 tab（精灵图输出）
- 顶部「精灵图布局」：行（rows）/ 列（cols）输入，持久化到 `data.sheetLayout`。
- 每个动画组下方有「精灵图预览」（`GroupSheetPreview` 组件）：按起止帧取帧 → `composeSpriteSheet` 合成 → `imageDataToDataUrl` 展示。依赖起止帧/fps/cols 变化时刷新（切 fps 也会重算）。
- 列表最下方【输出到画布】按钮：把每个有效动画组合成精灵图 → `imageDataToUrl` 上传 → 收集 URL 写入 `data.output.images`（节点统一输出约定，下游图片节点据此消费）。
- sheet 合成能力复用 `utils/image-ops/spriteSheet.js` 的 `composeSpriteSheet`（同 sprite-merge 处理器），URL↔ImageData 用 `utils/image-ops/io.js`。

## ffmpeg 插件（7 个 action）

| action | 用途 | 输入 | 输出 |
|---|---|---|---|
| ffmpeg_probe | 解析视频信息 | inputPath | format/video/audio/streams/duration |
| ffmpeg_extract_frames | 截取帧 | inputPath, mode(all/interval/seconds/count/fps), interval, secondsInterval, count, fps, maxWidth | frames[](httpPath), dir |
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
- 产物落 mini-app data 目录（`getMiniAppDataDir` + `saveMiniAppDataFile`），返回 httpPath

## 服务端改动（需重启 web）

### workspaceId → 插件 api 断点
- `plugin-runtime-api.ts`：`PluginSource` 加 `workspaceId?`，新增 `getMiniAppDataDir()` / `saveMiniAppDataFile(relPath, buffer)` / `resolveInputPath(inputPath)`
- `routes/plugin.ts:~187`：透传 workspaceId 给 `createBuiltinPluginApi({ workspaceId })`
- `getMiniAppDataDir` 传 `'.'`（非空字符串，否则 safeProjectSubdirPath 抛 Invalid file path）

## 通用帧播放器（FrameSequencePlayer.jsx）
- 使用本地 `@mediamonks/fast-image-sequence@2.2.0` dist，通过 `getFastImageSequence()` 原生 dynamic import。
- 支持播放/暂停、帧滑杆、当前绝对帧号、循环区间与可选 FPS 修改。
- frames/区间变化或组件卸载时调用 `destruct()`，释放 canvas、observer、worker 与图片缓存。
- 官方入口有相对 chunk import，vendor 必须同时保留 `fast-image-sequence.js` 和 `FastImageSequence-jb1XI9BR.js`。

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
| 截帧/首帧/尺寸调整逻辑 | ffmpeg 插件 `frames.js`（两份同步） |
| 节点注册 | `constants.js` + `canvas-constants.js` + `api.js` + `tools.js` |
| 上游视频派生 | `hooks/useDecoratedNodes.js` + `utils/input-images.js` |
| 插件路径规整 | `plugin-runtime-api.ts`（resolveInputPath） |

## Suggested Skills
- handoff（继续交接）
- write-mini-app-code（改 mini-app 前必读）
