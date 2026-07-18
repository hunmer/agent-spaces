# 测试与质量

## 测试

### Server 测试

位于 `packages/server/test/`，20+ 测试文件：

| 测试文件 | 覆盖范围 |
|---|---|
| `agent-skill-template.test.ts` | Agent 技能模板 |
| `codex-function-tool-bridge.test.ts` | Codex 工具桥接 |
| `grok-runtime.test.ts` | Grok 运行时（注：位于 `src/adapters/`，非 `test/`） |
| `hermes-runtime.test.ts` | Hermes 运行时 |
| `langchain-runtime.test.ts` | LangChain 运行时 |
| `message-parts.test.ts` | 消息解析 |
| `mini-app-agent.test.ts` | Mini App Agent |
| `mini-app-db.test.ts` | Mini App 数据库 |
| `pi-runtime.test.ts` | Pi 原生 SDK 运行时 |
| `open-agent-sdk-runtime.test.ts` | Open Agent SDK 运行时 |
| `sql-safety.test.ts` | SQL 安全 |
| `sqlite-store.test.ts` | SQLite 存储 |
| `workflow-*.test.ts` (8个) | Workflow 执行引擎 |

### 测试命令

```bash
# 运行 Server 测试
pnpm --filter @agent-spaces/server test
```

**注意**：Web 前端、Electron、SDK、Shared 目前无独立测试文件。

## 代码质量

| 工具 | 范围 | 命令 |
|---|---|---|
| ESLint | Web 前端 | `pnpm --filter @agent-spaces/web lint` |
| TypeScript | 全部 TS 包 | 各包 `tsc` / `tsc --watch` |
| Flutter Analyze | Flutter | `flutter analyze` |

## 质量风险

- Web 前端缺少单元/集成测试。
- SDK 无测试。
- Shared 仅类型导出，无运行时测试需求。
- Electron 无独立测试。
- Workflow 执行引擎测试覆盖较好（8 个测试文件）。
