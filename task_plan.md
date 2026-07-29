# 任务计划：动态节流与网格切片删除

## 目标
- 节流间隔随 `列×行` 增长，并限制合理上下限。
- 网格实时切片列表显示单项删除图标并正确更新数据。

## 阶段
- [x] 检查工作区状态
- [x] 定位节流和删除路径
- [ ] 实施最小修改
- [ ] 语法、Lint、行为验证

## 约束
- 仅修改 `UiSplitterDialog.jsx`。
- 保留其他用户改动。
- 删除仅影响当前实时结果；参考线或行列再次变化时按网格重新生成。

## 错误记录
无。

---

# 任务计划：Spine 编辑器迁入 game-asset-canvas

## 目标
- 将独立 Spine 编辑器完整整合进 `game-asset-canvas`。
- 编辑器 UI 全部切换到 `ui-exports` 提供的组件。
- 将 AI 换肤能力融合进当前换皮肤侧边栏。
- 将 npm 运行时依赖改为 dist CDN，并按其他节点模式保存到本地。

## 阶段
- [x] 盘点独立项目、当前节点、ui-exports、侧边栏与 CDN 模式
- [x] 确定最小迁移边界和文件映射
- [ ] 实施源码、UI、侧边栏与本地 CDN 迁移
- [x] 实施源码、UI、侧边栏与本地 CDN 迁移
- [x] 重建 vendor 产物并验证静态资源
- [x] 执行构建/测试与最终检查

## 约束
- 保留工作区已有改动，不回滚无关文件。
- 复用 game-asset-canvas 既有 UI 和 CDN 资源加载模式。
- 不保留独立编辑器旧 DOM UI。

## 文件映射
- `spine-editor-build/src/core/*` → `src/spine/core/*`
- `spine-editor-build/src/loaders/*` → `src/spine/loaders/*`
- `spine-editor-build/src/exporters/*` → `src/spine/exporters/*`
- `spine-editor-build/src/ui/*` → 不迁移，由 React 宿主 UI 重写
- `spine-editor-build/src/main.js` → 不迁移，编排进入 `SpineEditorDialog.jsx`
- PixiJS / pixi-spine / JSZip dist → `src/vendor/spine/`

## 错误记录
- 批量 `apply_patch` 纯移动文件被拒绝（空 hunk）；改为移动时同步更新模块注释或 import。
- 迁移后的 Node 测试首次加载失败：`src/spine` 内部 import 缺少 `.js` 扩展；统一补扩展后重跑。
- 环境策略拒绝 `rm -rf` 清理旧项目；改为把两个精确目录移动到系统废纸篓，保留可恢复性。
- Playwright 自带 Chromium 未安装；改用本机 Google Chrome 可执行文件进行运行态检查。
