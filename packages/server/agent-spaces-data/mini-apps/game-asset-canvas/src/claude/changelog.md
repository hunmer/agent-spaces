# 索引生成/更新记录

> 仅记录 `/ccjk:init-project` 的索引生成/更新动作，不与产品 Changelog 混用。保留最近 5 条，新增后删除更早记录。

## 2026-07-25 init-project 首次生成

- **动作**：首次执行 `/ccjk:init-project`，为 `game-asset-canvas` mini-app 生成 AI 上下文索引。
- **范围**：完整扫描 `src/` 顶层 + `components/`（17 顶层 + 5 canvas + 19 nodes）+ `hooks/`（16）+ `utils/`（16 顶层 + 11 image-ops）+ `services/`（1）+ `manifest.json`。
- **跳过**：`vendor/`（51MB 二进制资源，仅记录加载方式）、`assets/`（静态资源）、`chat/` `data/` `configs/`（运行时数据）、`src/CLAUDE.md`（旧版契约，保留作历史参考）、`src/handoff.md`（历次迭代交接文档，已提炼到本目录详情）。
- **产出**：
  - 新建 `src/claude/` 目录 + 11 个详情文件（overview/conventions/module-responsibilities/entrypoints/public-interfaces/dependencies-and-config/data-model/testing-and-quality/file-map/faq/changelog）
  - 新建 `src/CLAUDE.md`（轻量索引，替代旧版 268 行单文件契约）
- **覆盖率**：源码核心 100% 覆盖（关键文件全部定点读取：Canvas/constants/services/api/workflow/image-ops/index/useCanvasState/useNodeExecutions/useCanvasAgentRpc/settings/storage）。
- **统计**：101 个 JS/JSX 源码 / 146 个 src 总文件 / 16 hooks / 19 节点组件 / 5 canvas 子组件 / 12 图像处理器。
- **下次建议**：如新增节点类型/工作流槽位/图像处理器，按 `file-map.md` 末尾的「关键路径速查」同步更新对应详情文件。
