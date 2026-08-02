# Progress

## 2026-08-02
- 已阅读 handoff 文档并建立实施计划。
- 已完成第一轮定位：共享标题入口为 `NodeShell.jsx`，API schema 位于 `tools.js`。
- 已确认 `data.onUpdate` 可直接持久化 `data.title`，并梳理 add/update/query RPC 的兼容点。
- 已检查特殊节点：便签需单独接入；图片/视频展示节点没有 Header，不新增结构。
- 已实现共享标题原位编辑，并接入 NodeShell/便签；紧凑态显示自定义标题。
- 已扩展 add_node/add_nodes/update_node 的 title 参数，保留 label 兼容，查询返回 title。
- Babel JSX 转换、JS 解析与 `git diff --check` 均通过。
- 已更新 `handoff.md` 的节点标题约束。
- 标题输入增加输入法组合态保护，避免中文候选确认时误提交。
- 已开始节点图片输入/产出 HoverCard 任务，完成共享渲染入口定位。
- 已为 ImageResult、UpstreamImageList、本地/宿主 FileUpload 及三个特殊输入预览接入 HoverCard。
- JSX/TSX Babel 语法、`git diff --check`、Web 针对性 ESLint 均通过。
