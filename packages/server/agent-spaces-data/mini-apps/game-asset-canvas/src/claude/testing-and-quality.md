# 测试与质量

## 测试框架

**项目内无测试框架**（无 package.json，无 jest/vitest 配置）。质量保证依赖：

1. **语法自检脚本**（手动跑，见下）
2. **宿主层 lint/tsc**（仅对 `packages/web` 和 `packages/server` 的 TypeScript 文件）
3. **手测**：刷新 mini-app 后人工验证功能

Spine 坐标逻辑使用 Node 内置测试运行器：
`node --test src/spine/test/BoneGizmoLayer.test.js`。

## 语法自检（验收/调试速查）

### JSX/JS 语法（Babel 转 React preset）
```bash
node --input-type=commonjs -e "require('@babel/standalone').transform(require('fs').readFileSync('文件路径','utf8'),{presets:['react']})"
```
返回对象不抛错即语法正确。无输出 = OK。

### 宿主 tsx 语法
```bash
# babel 需带 typescript + react preset + filename
node --input-type=commonjs -e "require('@babel/standalone').transform(require('fs').readFileSync('文件','utf8'),{filename:'x.tsx',presets:[['typescript'],['react']]})"
```

### import 闭环检查
按目录解析相对 import，递归检查所有依赖文件都能被 Babel 转译（无循环/无缺失）。详见 `src/handoff.md` 的「验收/调试速查」段。

## 质量风险

| 风险点 | 位置 | 说明 |
|--------|------|------|
| ReactFlow `selected` 覆盖 | decoratedNodes | **不要**覆盖 `selected`，会破坏内置选中/删除 |
| NodeResizer 失效 | 建节点处 | 必须同时给顶层 `width`/`height` + `style:{width,height}` |
| 删除键失效 | 焦点在 input 时 | ReactFlow 故意忽略，需先点画布空白 |
| TDZ | 多处 useCallback | 被依赖的 const/useCallback 必须先声明（如 REMBG_MODELS 在 CUTOUT_PARAMS 前） |
| 工作流超时 | workflow.js | 必须 `max_wait_ms:600000`，默认 120s jimeng/可灵超时 |
| 外链图失效 | runWorkflow 产出 | 必须 `persistImagesToBackend` 下载到 data/ 换 httpUrl |
| 相对路径跨域 | 节点产出 → 工作流 | 必须 `normalizeImageUrls` 补 origin |
| ImageResult items 二次 map | ImageResult/HistoryCard | items 已是 `[{src,type}]`，再 map 会让 src 变对象，触发 `startsWith is not a function` |
| 媒体 onComplete 漏写 history | useExecutionQueue | onComplete 必须调 addHistory，否则队列产出在生成记录 tab 不显示 |
| config 初次读取空 | useGenerationHistory/useSettings/usePromptLibrary | 挂载时 getConfig 可能返回 null，必须用 `getConfig + onConfigReady + onAnyConfigChanged` 三重读取 |
| Pixelorama 改 GDScript 不生效 | service worker 缓存 | 改 pck 后必须无痕窗口或 unregister SW + clear site data |
| 多选 toolbar 干扰 | NodeShell | `isVisible={selected && selectionCount <= 1}`，多选时全隐藏 |
| dialog Delete 误删节点 | UiSplitter/BBoxViewer Dialog | window capture 阶段拦截 keydown + stopPropagation |
| fabric 画布坐标错位 | BBoxViewerDialog AI 分析 | 压缩不改尺寸（只 maxSizeMB），坐标 1:1 |
| BBox hover 高亮错框 | BBoxViewerDialog highlightBox | 列表按 `rects()` 索引关联，hover 时禁止对 bbox 调 `bringToFront` 改变对象顺序 |
| useCallback deps 引用未初始化 | UiSplitterDialog deleteSelectedRects | 必须声明在被依赖的 pushHistory/renderList 之后 |
| lucide-react 直接 import | 任意组件 | 不在 allowlist，必须从 `@agent-spaces/ui` 命名导入 |

## Lint/类型检查

- **项目内无 lint/tsc**：所有 `.js`/`.jsx` 不走类型检查。
- 宿主 `packages/web` 有 ESLint + tsc，但只检查宿主代码，不检查 mini-app src。
- 改宿主层后建议跑 `cd packages/web && pnpm tsc --noEmit` 验证类型。

## 调试技巧

- **F12 控制台**：mini-app 在宿主 iframe 内，需切换 console context 到对应 iframe。
- **配置查看**：`window.AgentSpaces.getConfig('workspaces/default/canvas.json')` 直接读 config。
- **状态检查**：`window.AgentSpaces` 上挂的所有 API 都可手动调（如 `uploadFile`/`callPluginTool`）。
- **Pixelorama 调试**：`[PXR]` 前缀日志（GDScript print，经 index.js onPrint 输出）；父端 `[pxr-parent]` 前缀。
- **workflow 事件**：`subscribeWorkflowEvents(cb)` 监听 `workflow:started/progress/completed/error`。
- **清污染数据**：`configs/canvas.json` 曾被写入 `selected:true`，用 node 脚本清；`panel-layout.json` 旧格式数组需重置为 `{canvas-main:72,canvas-right:28}`。
