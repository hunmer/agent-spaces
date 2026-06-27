# Server 模块 — 测试与质量

## 测试

位于 `test/`，20+ 测试文件。

### 运行命令

```bash
pnpm --filter @agent-spaces/server test
```

### 测试覆盖

| 分类 | 测试文件 |
|---|---|
| AI 运行时 | hermes-runtime, langchain-runtime, oh-my-pi-runtime, open-agent-sdk-runtime, codex-function-tool-bridge |
| Agent | agent-skill-template, mini-app-agent |
| Workflow | workflow-editor-tools, workflow-execution-snapshot, workflow-current-node-error, workflow-end-output-edge, workflow-nested-value, workflow-output-object, workflow-partial-loop, workflow-plugin-input-coercion, workflow-config-template |
| 存储 | sqlite-store, mini-app-db, sql-safety |
| 消息 | message-parts |

## 代码质量

- TypeScript strict + ESM。
- `tsc` 编译检查。
- 无 ESLint 配置（Server 包未发现）。
