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

# 任务计划：Spine 录制导出与本地节点加载修复

## 目标
- 录制完成后显示视频预览对话框，提供“导出到画布”和“下载视频”。
- 修复编辑器右上角设置按钮与 Dialog 关闭按钮重叠。
- 修复从节点文件加载 `/Users/Zhuanz/Downloads/pixel_female_mage` Spine 资源报错。

## 阶段
- [x] 阅读交接文档并定位三条实现链路
- [x] 确认本地样例加载失败根因
- [x] 实施最小修改
- [x] 执行静态、单元与针对性验证
- [x] 根据浏览器反馈定位 4.2 IIFE 严格模式导出捕获失败
- [x] 修复 namespace 捕获并重新验证
- [x] 录制期间隐藏骨骼 Gizmo，停止或异常后恢复
- [x] 验证录制显隐改动
- [x] 将录制源裁剪为角色屏幕包围盒
- [x] 验证裁剪计算、转译与回归测试
- [x] 录制开始自动适应视图并锁定视图交互
- [x] 验证录制视图锁定

## 约束
- 保留工作区已有改动，不回滚无关文件。
- 复用现有 UI 组件与节点输出协议。
- 录制结束时不再自动写入节点输出。
- Spine 4.2 使用官方 `spine-pixi-v7@4.2.119` 本地 IIFE，与现有 3.8 runtime 并存并按 JSON 版本路由。

## 错误记录
- 交接文档给出的 `game-asset-canvas/docs/skills/write-mini-app-code/SKILL.md` 路径不存在；实际文件位于仓库根目录 `docs/skills/write-mini-app-code/SKILL.md`，已完整读取。
- Node 首次直接 eval 官方 4.2 IIFE 时命中了 Node 自带 `require`，尝试解析 `@pixi/core` 失败；改为向 IIFE 显式注入现有 `PIXI` namespace 后，真实样例解析成功。浏览器无 Node `require`，正式加载器使用 IIFE 自带的 `window.PIXI` shim。
- 浏览器反馈 `Spine 4.2 本地运行时初始化失败`：官方 IIFE 顶层为严格模式，局部 `var spine` 不会挂到 `window.spine`；改为用 `new Function` 返回局部 namespace。

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

---

# 任务计划：修复 Spine 角色库选择无响应

## 目标
- 选择内置角色后正确加载并显示 Spine。
- 保留上传、本地编辑与换肤链路现有行为。

## 阶段
- [x] 阅读交接文档并定位调用链
- [x] 确认选择事件无响应的根因
- [x] 实施最小修复
- [x] 执行静态与针对性验证
- [x] 根据二次反馈定位 Dialog canvas 延迟挂载问题
- [x] 改用可观察的 callback ref 触发初始化，并添加生命周期调试输出
- [x] 重新执行静态与针对性验证
- [x] 根据错误日志定位远程资源代理 500
- [x] 确认资源所在 gh-pages 分支并切换至稳定 CDN
- [x] 验证新 CDN 三件套与静态代码

## 约束
- 仅修改角色选择加载链路及必要测试。
- 保留工作区现有改动。

## 错误记录
- 首次追加规划时锚点缺少一个空格，补丁未匹配；改用文件中的精确尾行重新追加。
- 浏览器连接曾停在登录页；用户要求不使用浏览器实测，后续仅执行静态检查与单元测试。
- 清理冗余 ref 时补丁文件区段写错导致未匹配；拆分为明确的多文件区段后应用。
- CDN 探测脚本误用 zsh 只读变量 `status`；更名为 `probe_result` 后完成检查。

---

# 任务计划：Spine 播放、换肤模型与适应视图

## 目标
- 增加 Spine 动画播放速度控制。
- 将 Nano Banana 换肤调用切换为 `edit_image` workflow，并在编辑器设置中选择处理模型。
- 修复适应视图的缩放与居中。

## 阶段
- [x] 盘点播放器、模型列表、workflow 调用与 fitView 实现
- [x] 设计最小状态与组件改动
- [x] 实施播放速度和设置对话框
- [x] 实施 edit_image workflow 调用
- [x] 修复 fitView 边界计算并补测试
- [x] 静态检查与针对性测试

## 约束
- 复用 `@agent-spaces/ui` 和 SettingsDialog 现有模型约定。
- 保留现有换肤分割、repack 与导出链路。
- 不使用浏览器实测。

## 错误记录
无。
