# Workflow Agent Handoff

## 目标

继续处理工作流里 `agent_run` / `agent` 编辑保存链路相关问题，重点是敏感字段脱敏、能力字段保留、以及运行时取值来源校正。

## 当前结论

- `agent_run` 的 `data.agent.apiKey` 已从工作流持久化链路移除。
- `agent_run` 保存时不会再按 preset 过滤 `mcps/skills/tools`，能力字段会原样保留。
- `agent_run` 运行时的 `apiKey` 解析已修正为优先按 `providerId/apiBase` 回到 `llm/providers.json`，避免 fallback preset 携带旧 key。
- `packages/server/agent-spaces-data/workflows/9bd50adc-36c1-4126-98d9-72613be06c0a/workflow.json` 已清掉明文 `apiKey`，但仓库里其它 agent template 仍可能存在敏感 key，后续建议继续清理。

## 已改文件

- `G:/agent_spaces/packages/server/src/services/workflow.ts`
  - `agent_run` 保存时不再裁掉 `mcps/skills/tools`
  - `apiKey` 不再写入工作流节点

- `G:/agent_spaces/packages/server/src/services/execution-agent-runner.ts`
  - `resolveAgentPreset()` 增加 provider 回填逻辑
  - 当节点声明 `providerId/apiBase` 时，从 `llm/providers.json` 重新取 `apiKey`

- `G:/agent_spaces/packages/server/test/workflow-agent-sanitize.test.ts`
  - 新增“保存保留能力字段”回归

- `G:/agent_spaces/packages/server/test/execution-agent-runner.test.ts`
  - 新增“fallback preset 不能挟带旧 key”回归

- `G:/agent_spaces/packages/server/agent-spaces-data/workflows/114e9c8f-b110-48a1-9318-d178886d15bb/workflow.json`
  - 已移除明文 `apiKey`

## 相关上下文

- 前端入口：`G:/agent_spaces/packages/web/src/components/workflow/workflow-fields-agent.tsx`
  - 这个组件本身会把 `mcps/skills/tools` 传回工作流节点，不是丢字段的根因。

- 工作流保存链路：`G:/agent_spaces/packages/server/src/services/workflow.ts`
  - 之前在 `sanitizeWorkflowAgentValue()` 中按模板过滤能力字段，导致保存后丢失。

- 运行时链路：`G:/agent_spaces/packages/server/src/services/execution-agent-runner.ts`
  - `executeAgentRun -> resolveAgentPreset -> createAgentRuntime`

- agent 模板来源：`G:/agent_spaces/packages/server/src/services/agent.ts`
  - `listPresets()` 读的是 `agent-templates`，不是 `llm/providers.json`
  - `readAgentTemplate()` 会 hydrate provider，可能把旧 key 带进 preset

## 验证结果

- `pnpm --filter @agent-spaces/server exec tsx --test test/workflow-agent-sanitize.test.ts`
  - 通过

- `pnpm --filter @agent-spaces/server exec tsx --test test/execution-agent-runner.test.ts`
  - 通过

## 仍需注意

- `agent-templates` 下已有若干模板仍包含明文 `apiKey`，尤其是 built-in / seeded agent 模板。
- 当前仓库还有其它未处理的修改文件：
  - `packages/web/src/components/common/agent-icon.tsx`
  - `packages/web/src/components/issue/issue-detail-tasks-panel.tsx`
  - `packages/web/src/components/issue/issue-detail.tsx`
  - `packages/web/src/components/workflow/workflow-execution-input-dialog.tsx`
- 这些不是本次问题的直接修改目标，后续接手时不要误回滚。

## Suggested Skills

- `diagnose` - 继续追踪保存/运行时链路问题时使用
- `tdd` - 给保存和运行时行为补更多回归时使用
- `code-architecture-research` - 需要进一步梳理 workflow / agent 运行路径时使用

## 下一步建议

1. 清理 `packages/server/agent-spaces-data/agent-templates` 下仍含明文 `apiKey` 的模板。
2. 如果要彻底收口日志，再把 `[claude-code] apikey:` 之类日志改成脱敏输出。
3. 如需验证实际 UI 行为，重新打开工作流编辑器，编辑 `agent` 并保存，检查 `workflow.json` 是否保留 `mcps/skills/tools`。
