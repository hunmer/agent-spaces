# Progress

- 2026-07-31：开始检查插件多配置能力在 Mini App 与 Workflow 中的实现边界。
- 已定位 Workflow 方案选择逻辑与 Mini App 当前单配置入口。
- 已确认命名方案当前是 Workflow 特有实现；Mini App 执行只使用插件默认配置。
- 已完成插件级方案 API、通用 UI、Workflow/Mini App 选择持久化及执行配置注入。
- SDK build 通过；Web 针对性 ESLint 无错误。服务端需在重建 shared 后复验。
- shared 重建后 server build 通过；已补旧 Workflow 方案的自动迁移兼容，并移除旧 Workflow 专用配置弹窗。
- 最终验证：SDK build、server build、插件方案 CRUD 冒烟测试、`git diff --check` 均通过；Web 针对性 ESLint 0 errors（仅既有 warnings）。
- Web 全量 `tsc --noEmit` 仍被仓库既有 dropzone/tiptap/图表等类型错误阻塞，本次文件未出现在错误列表。
- 追加需求：在 `workflow-plugin-card.tsx` 复用通用方案控件，并绑定 Workflow 当前方案。
- 插件卡片已支持默认/命名方案切换与当前方案编辑；相关 ESLint 0 errors，`git diff --check` 通过。
- 追加需求更新：工作流执行核心支持本次调用级插件配置，而非仅 Mini App 入口。
- 已完成 `pluginConfigs` 核心解析及 REST/WS/Webhook/SDK/Agent/Mini App 入口透传；覆盖会传递到子工作流。
- shared、SDK、server build 均通过；对象覆盖、插件名解析、方案名读取的核心冒烟测试通过；`git diff --check` 通过。
- 开始实现 Mini App 工作流选择、data 配置文件和执行自动注入。
- 已恢复本轮上下文并确认剩余两个直接使用 `WorkflowListDialog` 的 Mini App 调用点，准备迁移并清理遗留状态。
- 已完成全部 8 个 Mini App 的 Host API 迁移；Host API 增加重复打开、卸载和配置写入失败清理；进入静态验证阶段。
- 验证进展：shared、SDK、server build 通过；Web 针对性 ESLint 0 errors；全量 tsc 仅命中仓库既有错误，本次文件未报错。
- 8 个迁移后的 Mini App JSX 均通过 esbuild 语法编译；直接渲染 `WorkflowListDialog` 的引用已清零；任务实现完成。
