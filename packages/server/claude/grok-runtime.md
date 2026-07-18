# Server 模块 — Grok 运行时协议

> 源码：`src/adapters/grok-runtime.ts`。适配器架构与统一接口见 [ai-adapters.md](ai-adapters.md)。

## 执行模型

`GrokRuntime.execute()` spawn 子进程驱动 Grok CLI，按行解析 stdout 的 streaming-json 事件流，聚合后返回 `AgentRunResult`。

```text
execute(prompt, cwd, options)
  ├─ prepareGrokHome()      // 可选：写 .grok/config.toml（自定义模型时）
  ├─ buildGrokArgs()        // 拼 CLI 参数
  ├─ spawn(grok, args, { cwd, env, windowsHide })
  ├─ stdout.on('data') → 按行 split → handleLine()
  │     ├─ parseGrokJsonLine()  // JSON.parse，非对象/null 返回 null
  │     └─ switch(event.type) { text | thought | end | error | default }
  ├─ stderr.on('data') → 仅日志（不参与结果）
  ├─ child.on('error') → ENOENT 提示安装 Grok CLI
  └─ child.on('close') → flushBuffers() + 聚合 AgentRunResult + finish()
```

## CLI 参数 (`buildGrokArgs`)

```bash
grok -p <prompt> --cwd <cwd> --output-format streaming-json --no-auto-update \
  [--model <model>] [--resume <sessionId>] [--max-turns <n>] \
  [--tools <comma,sep>] [--rules <systemPrompt>] \
  [--yolo | --permission-mode <mode>] [--effort <none|low|medium|high>]
```

| 参数 | 来源 | 说明 |
|---|---|---|
| `-p` | `appendOutputStyleToPrompt(prompt, outputStyle)` | prompt 末尾追加输出样式 |
| `--cwd` | `workingDir` | 子进程工作目录 |
| `--output-format streaming-json` | 固定 | stdout 按行 JSON 事件 |
| `--no-auto-update` | 固定 | 禁止 CLI 自更新 |
| `--model` | `config.model` | — |
| `--resume` | `options.resumeSessionId` | 续接会话 |
| `--max-turns` | `options.maxTurns` | — |
| `--tools` | `options.tools.join(',')` | — |
| `--rules` | `options.systemPrompt` | — |
| `--yolo` | `config.permissionMode === 'bypassPermissions'` | 否则 `--permission-mode <mode>` |
| `--effort` | `config.thinkingEffort`（`thinkingEnabled===false` → `none`） | 思考强度 |

## JSON 事件 Schema（stdout 按行）

`type GrokJsonEvent = Record<string, unknown> & { type?: unknown }`。每个事件是一行 JSON 对象，按 `type` 字段分发：

| `type` | 关键字段 | 处理 |
|---|---|---|
| `text` | `data: string` | 累积到 `textChunks[]`（不立即 emit，等 flush） |
| `thought` | `data: string` | 累积到 `thoughtChunks[]`（思考链，flush 时作为 `reasoning` 事件） |
| `end` | `sessionId` / `usage` / `total_cost_usd` / `stopReason` / `num_turns` | `flushBuffers()`；更新 sessionId（变化则 emit `session` 事件）；解析 usage/cost |
| `error` | `message` / `usage` / `total_cost_usd` | 记 `eventError` + usage/cost |
| 其他 | — | 日志 `event <type> \| keys=...`，**原行 push 到 output** |

无法 parse 的行（`parseGrokJsonLine` 返回 null）：日志 + 原行 push 到 output + emit `output` 事件。

### 缓冲与 flush 策略

`text` / `thought` 事件**不立即 emit**，累积到 chunks 数组。在 `end` 事件、`close` 事件、`flushBuffers()` 调用时统一合并：
- `thoughtChunks` → `mergeGrokTextChunks` → emit `{ type: 'reasoning', text, status: 'completed' }`
- `textChunks` → 合并 → push output + emit `{ type: 'output', line: text }`

`mergeGrokTextChunks` 仅 `.join('')`（Grok 的 text 事件已是分片，非增量 delta）。

## usage 与 cost

`normalizeGrokUsage(event.usage)` 归一化为 `{ inputTokens, outputTokens, cachedInputTokens, totalTokens }`：
- `input_tokens` / `output_tokens` / `cache_read_input_tokens` 直接取
- `total_tokens` 优先取事件值，否则 `input + output + cached`

`total_cost_usd`（number）直接透传到 `AgentRunResult.costUsd`。

## 结果判定（`close` 事件）

```text
error = eventError
     || (signal ? `stopped by signal ${signal}` : undefined)
     || (code === 0 ? undefined : stderr.trim() || `exit code ${code}`)

if (error) → failedResult(error, output, sessionId) + usage/costUsd
else        → { success: true, summary: summarizeResult(text), artifacts: [], output, sessionId, usage, costUsd }
```

`summarizeResult` 来自 `agent-runtime-types.ts`（统一适配器公共工具）。

## 自定义模型 endpoint（`config.toml` 生成）

当 `config.model` + `config.baseURL` 同时存在时，`prepareGrokHome` 在 `<configDir|cwd>/.grok/config.toml` 写入自定义模型定义，并通过 `GROK_HOME` 环境变量指向它。

`buildGrokCustomModelConfig` 生成 TOML：

```toml
[model."<model>"]
model = "<model>"
base_url = "<normalized baseURL>"
name = "<model>"
api_backend = "<chat_completions|responses|messages>"
max_completion_tokens = 16384  # config.maxTokens ?? 16384
env_key = "AGENT_SPACES_GROK_API_KEY"   # 有 apiKey 时
extra_headers = { "x-api-key" = "${AGENT_SPACES_GROK_API_KEY}", "anthropic-version" = "2023-06-01" }  # messages backend
```

### backend 归一化 (`normalizeGrokEndpoint`)

按 `provider` + `baseURL` 模式匹配决定 `api_backend`：

| 条件 | backend | baseURL 调整 |
|---|---|---|
| `api.minimaxi.com/anthropic` | `chat_completions` | → `https://api.minimaxi.com/v1` |
| provider 含 `anthropic-messages`（含转换型） | `messages` | 补 `/v1` 后缀 |
| `openai-responses` | `responses` | 原样（去尾斜杠） |
| `openai-chat-completions` 或无 provider | `chat_completions` | 原样 |
| 其他 | `undefined`（抛错） | — |

## 环境变量 (`buildGrokEnv`)

| 变量 | 条件 | 说明 |
|---|---|---|
| `XAI_API_KEY` | 有 apiKey 且**无** grokHome | 原生 Grok 后端 |
| `AGENT_SPACES_GROK_API_KEY` | 有 apiKey 且**有** grokHome | 自定义模型用，对应 `env_key` |
| `GROK_HOME` | 有 grokHome | 指向 `.grok` 目录 |

## 命令解析 (`resolveGrokCommand`)

优先级：`GROK_CLI_PATH` 环境变量 → Windows 下 `%USERPROFILE%/.grok/bin/grok.exe`（存在则用）→ PATH 上的 `grok`。

ENOENT 时 `on('error')` 转友好提示："Grok CLI was not found. Install Grok..."。

## 日志

所有日志前缀 `[grok:<runId>]`（`runId` 进程内自增）。关键节点：
- `starting`（cwd/command/model/provider/backend/baseURL/auth/grokHome/promptChars/resume/maxTurns/tools/permission/effort）
- `spawned` / `closed`（code/signal/elapsedMs/events 计数/stdoutItems/stderrChars）
- `done` / `failed`（elapsedMs/session/resultChars/usage/costUsd）
- `event text|thought|end|error`（按事件类型）
- `stderr`（每行单独记录，截断 500 字符）

## Runtime 管理（`routes/runtime.ts`）

`RUNTIME_DESCRIPTORS` 含 `grok`：id `'grok'`，label `'Grok CLI'`，commands `['grok']`，runtimeKind `'grok'`。Windows 路径探测 `.grok/bin/grok.exe`，两处 `descriptor.id === 'grok'` 特殊分支（CLI 发现 + 版本检测）。

## 测试

`src/adapters/grok-runtime.test.ts`（位于 adapters 目录，非 `test/`）。
