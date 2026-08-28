# 测试与质量

## 测试框架

**node:test 内置测试运行器**（无 jest/vitest，无 package.json）。约 62 个 `*.test.js` 分布在 src 各目录（utils 29+、components 15+、spine/test 8、services 1、api 1），另有项目根 `tests/` 3 个 `.test.mjs`。

```bash
# 单文件
node --test src/utils/output-resources.test.js
# 目录批量
node --test src/utils/
# 根 tests/
node --test tests/
```

其余质量保证：语法自检脚本（下）、宿主层 lint/tsc、手测刷新验证。

## 语法自检（验收/调试速查）

### JSX/JS 语法（Babel 转 React preset）
```bash
node -e "require('@babel/standalone').transform(require('fs').readFileSync('文件路径','utf8'),{filename:'x.jsx',presets:['react']})"
```
无输出 = OK。

### 宿主 tsx 语法
```bash
node -e "require('@babel/standalone').transform(require('fs').readFileSync('文件','utf8'),{filename:'x.tsx',presets:[['typescript'],['react']]})"
```

## 质量风险（高频坑点表）

| 风险点 | 位置 | 说明 |
|--------|------|------|
| ReactFlow `selected` 覆盖 | decoratedNodes | 不要覆盖，破坏内置选中/删除 |
| NodeResizer 失效 | 建节点处 | 必须顶层 `width/height` + `style:{width,height}` |
| 媒体 URL 作 React key | 上游输入列表 | 同 URL 会重复，用 `utils/list-keys.js` occurrenceKeys |
| 透传节点残留旧产出 | imageDisplay/videoDisplay | 有连入边时必须转发本轮派生值（含空数组），不回退旧 data.images/videos |
| videoEditor 上游视频被覆盖 | useDecoratedNodes | 必须去重合并非覆盖 |
| 视频切换清理误清持久化数据 | VideoEditorDialog | currentVideo effect 用 ref 跳过首次挂载，仅真实切换时清 frames/animGroups |
| 动画组派生不稳定 | VideoEditorDialog | frames/精灵图必须 useMemo/useCallback，只随源帧/起止/FPS/列数重算 |
| 队列中断状态残留 | useExecutionQueue | cancel 立即 onCancel 清节点状态；晚到结果用 cancelledJobIdsRef 丢弃，不能再走 onError 覆盖 |
| 宿主 taskEvents 丢事件 | mini-app-renderer.tsx | 不能只取 `.at(-1)`，必须事件游标增量全量分发（并发 RPC 会超时） |
| 分组执行结果写错 run | useGroupExecution/RPC | 请求冻结 executionTarget，结果按 target 写回；禁止完成时读当前 activeId 认领 |
| 粘贴属性误伤产出字段 | PastePropertiesDialog | output/images/videos/status/loading/error 等不参与应用；素材实例复制要保留目标 run 的 groupAssetInputUrls |
| 工作流超时 | workflow.js | 必须 `max_wait_ms:600000` |
| 外链图失效 | runWorkflow 产出 | `persistImagesToBackend` 落地（directory 时走 saveImageToDir 单写） |
| 相对路径跨域 | 节点产出 → 工作流 | 必须 `normalizeImageUrls` 补 origin |
| ImageResult items 二次 map | ImageResult/HistoryCard | items 已是 `[{src,type}]`，再 map 报 `startsWith is not a function` |
| 媒体 onComplete 漏写 history | useExecutionQueue | onComplete 必须调 addHistory |
| config 初次读取空 | 各 use*Config hook | 三重读取 `getConfig + onConfigReady + onAnyConfigChanged` |
| TDZ | 多处 useCallback | 被依赖的 const/useCallback 先声明 |
| lucide-react 直接 import | 任意组件 | 从 `@agent-spaces/ui` 命名导入 |
| Spine gizmo 坐标错位 | src/spine | 只用 `localTransform`，worldTransform 会重复应用父容器 fit/zoom |
| 边颜色/标签写入持久化 | decorateEdgesForSelection | 颜色是展示态；label 只随选中/hover，均不写入 edges |
| 网格拼接/Splitter 共享 CutoutSettings | ui-splitter | 修改时保留拆分器普通模式常驻吸色入口 |

## Lint/类型检查

- 项目内无 lint/tsc；宿主 `packages/web` 的 ESLint + tsc 只查宿主代码。
- 改宿主层后：`cd packages/web && pnpm tsc --noEmit`。

## 调试技巧

- F12 控制台切到 mini-app iframe context。
- 配置直读：`window.AgentSpaces.getConfig('workspaces/default/canvas.json')`。
- Toolbar「调试 → 一键补缩略图」：扫当前工作区节点/生成记录/素材库，按原图去重，4 并发生成 thumb，经 `save_canvas`/`save_generation_history`/`save_asset_library` 整文件回写（不用逐条 add_history 防重复记录）。
- workflow 事件：`subscribeWorkflowEvents(cb)` 监听 started/progress/completed/error。
- 清污染数据：`configs/canvas.json` 曾被写入 `selected:true`；`panel-layout.json` 旧格式数组重置为 `{canvas-main:72,canvas-right:28}`。
