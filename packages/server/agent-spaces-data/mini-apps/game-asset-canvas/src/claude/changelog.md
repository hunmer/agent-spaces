# 索引生成/更新记录

> 仅记录 `/ccjk:init-project` 的索引生成/更新动作，不与产品 Changelog 混用。保留最近 5 条，新增后删除更早记录。

## 2026-08-28 init-project 增量更新（按最新 handoff.md）

- **动作**：以 `src/handoff.md`（更新至 2026-08-27 分组全选/节点快捷动作）为准，全量重扫源码树并增量更新全部 11 个详情文件 + `CLAUDE.md` 索引。
- **范围**：src 297 个 JS/JSX（不含 vendor，含 ~62 个 node:test 测试文件）；定点核对 `utils/constants.js`（NODE_TYPES 38 个 / NODE_META）、`utils/settings.js`（DEFAULT_SETTINGS）、`src/api.js`（~27 handler）、`src/services/canvas.js`（31 handler）、`manifest.json`（3 agents + agentChatPlacement）、configs 布局。
- **主要增量**（相对 2026-07-25 首版，101 → 297 文件）：
  - 新节点 16 种：text/storyboard/videoEditor/videoDisplay/audioDisplay/depthExtract/directorDesk/photopea/workflowRunner/spineEditor/spineDisplay/maskPaint 等
  - 新 hooks 9 个（useGroupExecution/useImageSelection/useLastParams/useNodePresets/useSpineReskinHistory/useAlignmentGuides/useCanvasDragAutoPan 等，共 26）
  - Agent API 扩容：execute_node(s)/get_node_params/arrange_group/update_nodes/画布版本 3 个/素材库 10 个；RPC case 13 个
  - services 扩容：save_generation_history/save_last_params/storyboard 角色三件套/Spine 换肤历史/reset_prompts/save_asset_library/update_asset/move_asset
  - 新 configs：workspaces/<id>/{canvas-versions,last-params,storyboard-characters}.json + 全局 node-presets.json；workspace 增 directory 字段（产图落本地单写）
  - 分组多实例执行（count/assets + executionTarget 冻结身份）、分组「运行所有」串行、粘贴属性对话框
  - 输出资源协议 images+resources（thumb/groupName/label）、文本连线变量绑定、边颜色/标签展示态、自动吸附辅助线、拖拽自动平移
  - 宿主 Chat 经 agentChatPlacement=mini-app-slot 内嵌 RightPanel
- **跳过**：vendor/（二进制）、assets/、chat/、data/、configs/ 内容值、根目录历史交接文档（findings/progress/task_plan 等）
- **下次建议**：改功能后同步更新对应详情文件 + `src/handoff.md`；handoff 是活文档，优先级高于本目录。

## 2026-07-25 init-project 首次生成

- **动作**：首次执行 `/ccjk:init-project`，为 `game-asset-canvas` mini-app 生成 AI 上下文索引。
- **范围**：完整扫描 `src/`（101 个 JS/JSX：17 hooks / 19 节点组件 / 5 canvas 子组件 / 16 utils + 11 image-ops / 1 service）+ `manifest.json`。
- **产出**：新建 `src/claude/` 目录 + 11 个详情文件；`src/CLAUDE.md` 改为轻量索引。
- **统计**：101 个 JS/JSX 源码 / 146 个 src 总文件 / vendor ~51MB。
