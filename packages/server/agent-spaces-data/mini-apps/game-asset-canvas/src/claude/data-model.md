# 数据模型

mini-app 是浏览器端 React 单页，无数据库。所有持久化通过宿主 `configs/` 文件（JSON）+ `data/` 文件（图片）。本文件描述核心数据结构。

## 节点（Node）

ReactFlow 标准结构 + 项目自定义 data：

```typescript
interface Node {
  id: string;                    // genId('node') 生成，如 'node-abc123'
  type: string;                  // 见 NODE_TYPES（'textToImage' / 'ipGifSplit' / 'cutout' 等）
  position: { x: number; y: number };  // 画布坐标
  width: number;                 // 顶层 width（NodeResizer 依赖，必给）
  height: number;                // 顶层 height
  style: { width: number; height: number };  // 与 width/height 同步
  selected?: boolean;            // ReactFlow 自管，**不要在 decoratedNodes 里覆盖**
  data: NodeData;                // 业务数据（见下）
}

interface NodeData {
  label?: string;                // 节点标题（NODE_META[type].label 默认）
  status?: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  error?: string;                // 错误信息（status='error' 时）
  statusMsg?: string;            // 运行中状态文案（如「压缩图片 3/5…」）
  tags?: string[];               // 来源标签（IMAGE_TAGS 值，如 ['文生图','上传']）
  loading?: boolean;             // 加载/处理中
  // 注入的回调（运行时挂载，不持久化，序列化时 JSON.stringify 自动丢弃）
  onUpdate?: (patch) => void;
  onGenerate?: (input) => void;
  onGenerateMedia?: (kind, input) => void;
  onProcessImage?: (images, processType) => void;
  onProcessLocal?: (processorId, params, images) => void;
  onCutout?: (mode, modeParams, images) => void;
  onCutoutCreate?: (images) => void;
  onCancelProcess?: () => void;
  onPromptReverse?: (images) => void;
  onExportImages?: (images) => void;
  onEditImages?: (images) => void;
  onAutoSize?: () => void;
  onAutoSizeToContent?: () => void;
  onDeleteEdge?: (edgeId: string) => void; // 运行时注入：变量 HoverCard 删除对应文本边
  textVariableValues?: Record<string, Record<string, string>>; // 持久化：字段 -> 变量 -> 手动 fallback
  textVariableBindings?: Record<string, Record<string, Array<object>>>; // 运行时派生，不持久化
  selectionCount?: number;       // 当前选中节点总数（多选时隐藏 NodeToolbar）
  agentConfig?: object;          // BBox/反推提示词 AI 配置（从 settings 注入）
  groupAssetInputUrls?: string[]; // 分组「按上传素材执行」注入的只读输入 URL
  protectedUpstreamImageUrls?: string[]; // 运行时派生：来自上述分组素材、不可断开的上游 URL
}
```

### 节点特有 data 字段（按 type）

#### 文生图/编辑图片（textToImage / editImage）
```typescript
data.params = {
  prompt: string,                // 用户输入框提示词
  pickedPrompt?: string,         // 提示词库选中的提示词（展示为标签，提交时与 prompt 合并）
  model: string,                 // MODEL_OPTIONS 的 value（如 'gpt-image-1'）
  aspect: string,                // ASPECT_OPTIONS（如 '16:9'）
  size: string,                  // SIZE_OPTIONS（'1k'/'2k'/'4k'）
}
data.output = {
  images: string[];                  // 原图 URL 数组，保持下游执行/下载/Gallery 的稳定协议
  resources?: Array<{
    url: string;
    thumb?: string;                  // 仅用于缩略展示
    groupName?: string;              // 可选 UI 分组名，同名素材折叠到同一组
    label?: string;                  // 可选缩略图右上角标签
  }>;
};
data.images?: string[];          // 编辑图片节点：上游推入的输入图
data.uploadedImages?: string[];  // 编辑图片节点：用户上传的输入图
data.params.mask?: string;       // 编辑图片节点：上传/绘制得到的单张蒙版 URL
data.editMaskPaintData?: {       // 编辑图片节点：缩略图蒙版绘制快照
  inputSignature: string;
  perImage: Record<string, { imgW: number; imgH: number; ops: object[] }>;
};
```

#### 图片展示（imageDisplay）
```typescript
data.images: string[];           // 展示的图（来源：upload/url/upstream/history）
data.source: string;             // 来源标记（'upload'/'url'/'upstream'/'history'/'segment'/'enhance'/'processing'/'error'）
data.uploadedImages?: string[];  // 用户上传的图（FileUpload onChange 时 uploadFile 拿到的 http URL，持久化）
```

#### 图像处理（imageProcess 旧 / ip* 拆分后 12 个）
```typescript
data.params = {
  processor?: string,            // 旧 imageProcess 单节点用（新 ip* 节点从 nodeType 反查）
  processorParams: { [key]: any },  // IMAGE_PROCESSORS 对应处理器的参数
}
data.uploadedImages?: string[];  // FileUpload 上传图
data.images?: string[];          // 上游连线图（computeInputImages 派生，不进 FileUpload）
data.output = { images: string[] };
```

#### 抠图（cutout）
```typescript
data.params = {
  mode: 'whiteKey' | 'chromaKey' | 'workflow' | 'rembg',
  modeParams: { [key]: any },    // CUTOUT_PARAMS[mode] 对应参数
}
data.uploadedImages?: string[];
data.images?: string[];
data.output = { images: string[] };
```

#### 媒体（textToVoice / videoGenerator）
```typescript
data.output = { audio?: string } | { video?: string };  // 单 URL
data.params = {
  prompt, model, voiceId?,        // textToVoice
  images?, aspect, quality, duration, model,  // videoGenerator
}
```

#### 分镜创作（storyboard）
```typescript
data.sourceText: string;
data.params: {
  textToImage: { model, aspect, size, count, concurrency };
  editImage: { model, aspect, size, count, concurrency };
  video: { model, aspect, quality, duration, count, concurrency };
  voice: { model, voiceId?, count, concurrency };
};
data.scenes: Array<{
  id: string; index: number;
  narration: string; visualPrompt: string; animationPrompt: string;
  characterIds: string[];
  images: string[]; videos: string[]; audios: string[];
}>;
```

分镜 Agent 是全局设置：`settings.storyboardAgentConfigId/storyboardAgentName`，不写入节点 `data.params`。旧扁平生成参数由 `resolveStoryboardGenerationParams` 兼容读取。`scenes[]` 数组顺序是真值，拖拽后同步把 `index` 归一化为 `1..N`；媒体 URL 直接显示在所属分镜卡片，不自动物化为画布展示节点。

`audioDisplay` 使用 `data.audios: string[]`；`videoDisplay` 使用 `data.videos: string[]`。两者是独立展示/透传节点，不承载生成参数。

#### 反推提示词（promptReverse）
```typescript
data.uploadedImages?: string[];
data.images?: string[];
data.output = { text: string };   // AI 返回的提示词文本
```

#### UI 拆分（bboxViewer）
```typescript
data.uploadedImages?: string[];
data.images?: string[];
data.bboxData?: {
  imageUrl: string;               // bbox 所属背景图；恢复时必须与当前输入图一致
  boxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    meta?: object;                // id/label/type/depth/color/exportSlice/ocrText/textRole
  }>;
};
data.output = { images: string[] };
```

#### 便签（note）
```typescript
data.text: string;
```

## 边（Edge）

```typescript
interface Edge {
  source: string;                // 源节点 id（输出）
  target: string;                // 目标节点 id（输入）
  sourceHandle?: string | null;
  targetHandle?: string | null;
  markerEnd?: { type: MarkerType.ArrowClosed };  // 默认箭头
  animated?: boolean;            // 默认 true
  data?: {
    inputTarget?: string;         // 目标 FileUpload id；缺省/无效值回退到 images
    inputType?: 'image' | 'text' | 'video' | 'audio';
    inputVariable?: string;       // 文本边可选；仅替换 inputTarget 字段里的同名 {变量}
    sourceAsset?: {               // 分镜多素材 handle 选中的单个素材；旧边可缺省
      sceneId: string;
      type: 'image' | 'video' | 'audio';
      url: string;
      thumb?: string;
      label?: string;
    };
    pathStyle?: string;
    lineStyle?: string;
  };
}
```

- Handle 位置由全局设置决定：上下时 source=Bottom、target=Top；左右时 source=Right、target=Left。
- 连线语义：「source 产出图 → target 输入区」。旧边或 `inputTarget='images'` 由 `computeInputImages` 派生到 target 的 `data.images`；其它目标派生到 `data.fileUploadInputs[inputTarget]`。
- 多上传区声明集中在 `utils/connection-targets.js`。当前编辑图片节点声明 `images`（输入图片）和 `mask`（蒙版图片），手动连线时由用户选择。
- 文本边缺少 `inputVariable` 时保持整字段覆盖；存在时以目标节点持久化的 `data.params[inputTarget]` 为模板，只替换对应 `{变量}`。变量值优先级：整字段边 > 变量边 > `textVariableValues` 手动 fallback > 原占位符。
- 生成类文本字段由 Tiptap Decoration 高亮 `{变量}`，不改写模板 schema。HoverCard 有连线时列出各 edge 并隐藏输入框；全部删线后显示 fallback 输入。
- storyboard 每个 scene 使用 `storyboard-scene:<encodeURIComponent(sceneId)>` 作为 source handle。多素材连接把选中项写入 `sourceAsset`，`computeInputImages/Videos/Audios` 优先消费该素材；无该字段的历史边保持原行为。

## 分组（WorkflowGroup）

**不是节点**，是独立 state（useCanvasState 第三维，与 nodes/edges 平级）。复用 workflow-editor 同源 `WorkflowGroup` 类型：

```typescript
interface WorkflowGroup {
  id: string;
  name: string;                  // 如「文字生成图片 导出 14:30」
  childNodeIds: string[];        // 组内节点 id
  childGroupIds?: string[];      // 嵌套子组（递归 collectGroupNodeIds）
  locked?: boolean;
  disabled?: boolean;
  savedNodeStates?: Record<string, any>;  // 锁定/禁用前的状态快照
  batchExecution?: GroupBatchExecution;   // 分组多实例执行配置（见下）
}
```

- 持久化到 `canvas.json` 的 `groups` 字段（service `save_canvas` 透传）。
- 旧 canvas.json 无 groups 兜底为 `[]`。
- 删节点时 `onNodesDelete` 同步清理 groups 里悬空的 childNodeIds。

### 分组多实例执行（GroupBatchExecution）

```typescript
interface GroupBatchExecution {
  mode: 'count' | 'assets';
  count: {
    target: number;              // 1-50
    activeId: string | null;
    runs: Array<{ id: string; index: number; nodeStates: Record<string, NodeData> }>;
  };
  assets: {
    activeId: string | null;
    templateNodeStates: Record<string, NodeData> | null;
    runs: Array<{
      id: string;
      name: string;
      url: string;               // uploadFile 返回的持久化 URL
      nodeStates: Record<string, NodeData>;
    }>;
  };
}
```

- 当前实例仍以画布 `nodes[].data` 为实时状态；切换前写回当前 run，再恢复目标 run 的整组节点 data。
- 素材实例只替换没有上游输入的玩家上传槽位；图片展示节点写 `data.images`，普通接收节点写 `data.uploadedImages`，图片对比节点写未被上游占用的 first/second 槽位。
- 新素材实例会清空运行状态和旧产出。组内节点运行时禁止切换实例，避免异步完成回调写入其他实例。

## 画布文件（CanvasFile）

存 `configs/workspaces/<id>/canvas.json`（按工作区隔离）：

```typescript
interface CanvasFile {
  nodes: Node[];
  edges: Edge[];
  groups: WorkflowGroup[];
  viewport?: { x: number; y: number; zoom: number };
  savedAt: number;
}
```

`viewport` 记录该工作区最后一次画布平移和缩放状态；旧文件缺少该字段时使用默认视口，并在后续画布变更时写入。

输出预览是节点级状态，持久化在 `nodes[].data.outputPreviewMode`（缺省 false）。画布 Controls 入口只负责批量把所有节点设为 true；节点预览高度是运行时派生数据，不写入文件。读取旧文件时，若顶层 `outputPreviewMode` 为 true，会迁移到尚未设置该字段的节点。

## 生成记录（HistoryItem）

存 `configs/workspaces/<id>/generation-history.json`（数组，最新在前，HISTORY_MAX=200）：

```typescript
interface HistoryItem {
  id: string;                    // genId('hist')，如 'hist-xyz'
  nodeId: string | null;         // 来源节点 id（队列产出为 null）
  nodeType: string;              // NODE_TYPES 值（用于 HistoryCard 取 label）
  prompt: string;                // 提示词或处理描述（如 '抠图·workflow'）
  model: string;                 // 模型名 / 'local' / 'image_enchanter' / 'rembg' / 'agent_run'
  images: string[];              // 产出 URL 数组（媒体节点单元素数组）
  mediaType?: 'audio' | 'video' | 'text';  // 媒体产出标记（HistoryCard 按此渲染播放器）
  text?: string;                 // 反推提示词的文本产出（截断 5000）
  createdAt: number;             // Date.now()
}
```

## Spine 换肤生成记录

存 `configs/spine-reskin-history.json`，按 Spine 三件套资源签名隔离；每组最多 20 条，同名 skin 原子替换：

```typescript
type SpineReskinHistoryFile = Record<string, SpineReskinHistoryItem[]>;

interface SpineReskinHistoryItem {
  id: string;
  name: string;
  prompt: string;
  timestamp: number;
  thumbnailUrl: string;          // 原布局预览 PNG 的服务端 URL
  stages: Array<{ label: string; src: string }>;
  stats: object;
  assets: {
    pngUrl: string;              // repack atlas PNG
    previewPngUrl: string;       // 保持旧 UV 布局的热预览 PNG
    atlasUrl: string;
    spineJsonUrl: string;
    skelUrl: string;
  };
}
```

记录由 `useSpineReskinHistory` 使用 `getConfig/onConfigReady/onConfigChanged` 订阅，多预览实例自动同步。

## 设置（Settings）

存 `configs/settings.json`（全局共享）。结构见 `utils/settings.js DEFAULT_SETTINGS`，前端读时用 `mergeSettings` 补默认值。

画布样式字段：`bgVariant: 'dots' | 'lines' | 'cross'`、`attributionPosition: 'top-bottom' | 'left-right'`、`snapGrid: boolean`。

## 工作区清单（WorkspacesFile）

存 `configs/workspaces.json`：

```typescript
interface WorkspacesFile {
  activeId: string;              // 当前激活工作区 id
  workspaces: Workspace[];
}
interface Workspace {
  id: string;                    // 'default' 或 'ws-<base36>-<random>'
  name: string;
  createdAt: number;
}
```

## 提示词条目（PromptItem）

内置库（`utils/prompts.js PROMPT_LIBRARY`）+ 自定义库（`configs/prompt-library.json`，全局共享）：

```typescript
interface PromptItem {
  id: string;
  category: string;              // PROMPT_CATEGORIES 的 id
  title: string;
  desc?: string;
  prompt: string;                // 提示词正文
  scene: 'text' | 'edit' | 'both';  // 适用场景
  aspect?: string;               // 选填，选中时联动比例下拉
  custom?: boolean;              // 自定义库标记（UI 显示 🆕「自」标）
  references?: string[];         // 相对 src 目录的参考图路径（可选）
}
```

## 素材库（AssetLibrary）

存 `configs/workspaces/<id>/asset-library.json`（按工作区隔离）：

```typescript
interface AssetLibrary {
  categories: AssetCategory[];
}
interface AssetCategory {
  id: string;
  name: string;
  createdAt: number;
  assets: Asset[];               // 头部追加，截断 ASSET_MAX_PER_CATEGORY=500
}
interface Asset {
  id: string;
  url: string;                   // http URL（uploadFile 返回）
  name: string;
  size: number;
  uploadedAt: number;
}
```

## 分镜角色库

存 `configs/workspaces/<id>/storyboard-characters.json`：

```typescript
{
  characters: Array<{
    id: string;
    name: string;
    prompt: string;
    images: Array<{ id: string; url: string; selected: boolean }>;
  }>;
}
```

## 面板布局（PanelLayout）

存 `configs/panel-layout.json`（全局共享）：

```typescript
{
  layout: { canvas-main: 72, canvas-right: 28 };  // ResizablePanel@4：{ panelId: percentage }
  showMinimap: boolean;          // 缺省视为 true
  savedAt: number;
}
```

> `ResizablePanel` 的 `minSize`/`maxSize`/`defaultSize`：数字=px，百分比必须字符串 `"18%"`。

## Agent RPC 消息（clientRequest）

服务端 → 浏览器：

```typescript
{
  event: 'miniApp.clientRequest',
  data: {
    requestId: string,           // 唯一标识，用于 respondClientRequest
    type: string,                // 'canvas.addNode' 等
    payload: any,
  }
}
```

浏览器 → 服务端（响应）：`window.AgentSpaces.respondClientRequest(requestId, result, ok=true, error?)`。

## 工作流执行结果（execute_workflow_sync 返回）

```typescript
{
  status: 'completed' | 'failed' | ...;
  timedOut?: boolean;            // 是否超过 max_wait_ms
  steps: WorkflowStep[];         // 各节点执行情况
}
interface WorkflowStep {
  nodeType: 'start' | 'end' | 生成节点类型;
  status: 'completed' | 'failed' | 'skipped';
  output?: {
    result?: string[] | object;  // end 节点产出（图片 URL 数组 / tts audio 对象 / video URL 字符串）
    images?: string[];
    image_urls?: string[];       // image_enchanter 用此字段
    data?: { images?: string[] };  // 生成节点结构（jimeng/aliyun）
  };
  error?: string;
}
```

提取优先级（`extractOutput`）：end 节点 → 生成节点 `data.images` → 任意 completed 节点。

## 图片 URL 约定

- **后端地址**（无需下载落地）：`data:`/`blob:`/非 http 协议；同源 + 路径匹配 `/api/mini-apps/<projectId>/(data/file|src/file|local-file|proxy-image)`。
- **外链**（需 `persistImagesToBackend` 下载到 `data/`）：其余 http(s) URL。
- **相对路径**（需 `normalizeImageUrl` 补 `window.location.origin`）：以 `/` 开头的（如 `/static/uploads/xxx.png`）。
