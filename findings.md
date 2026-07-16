# Findings

- 父日志与子日志都稳定包含首个错误 `Loop node missing body`；子日志快照实际存在对应 `loop_body` 节点和 loop-body 边。
- 后续 `Workflow variable reference missing node output` 是循环节点无输出的连锁错误。
- `缺少 secretId 或 secretKey` 是独立插件配置错误，不是循环 body 丢失的原因。
- `executeSubWorkflow` 把目标节点/边传给 `executeEmbeddedWorkflow`，但 `executeLoopNode` 从父 `session.nodes` 查找 body，存在明显作用域错配。
- 待验证：复合元数据兼容性、runtime edge 过滤是否构成第二层问题。
- 实际子工作流 `workflow.json` 的 loop/body 含完整 `parentId/rootId/role`，排除元数据缺失。
- loop-body 锁定边是非 reference 边，会进入 runtime edge，暂排除边过滤问题。
- 根因确认：节点遍历使用局部子工作流图，但 `executeNode` 内部的输入/引用边绑定、循环 body 查找和分支判断仍读取父 `session.nodes/session.edges`。
- 子工作流插件配置也只按父 `session.workflow/session.nodes` 加载，导致目标工作流启用的 COS 配置在子执行中为空。
- 修复采用异步执行图作用域，携带当前 nodes、edges、config；避免并行或嵌套子工作流通过临时修改父 session 相互污染。
- 用户认为父调用未向子 start 传入数据；日志中 loop 的 `arrayPath` 已解析为父输入数组，说明 start 执行数据实际存在。回归测试已改为显式覆盖父输入 → 子 start → loop 引用链。
- 修改后的真实 handoff 测试通过：嵌入输入写入子 start，loop 可读取并完成两次迭代。未生成 start 步骤日志是现有嵌入执行设计，不代表数据缺失。

## Pi 原生 SDK 迁移

- 旧测试已替换为原生 `createAgentSession()` 隔离会话测试。
- `@earendil-works/pi-coding-agent` 最新版要求 Node >=22.19；项目支持 Node 20，因此使用官方 legacy-node20 版本 0.74.2。
- 待盘点旧 `OhMyPiRuntime` 对外行为及所有 `oh-my-pi` 标识。
- 旧适配器把 pi 放在外部 CLI 进程后：负责模型/密钥参数、技能目录、MCP bridge、事件流、会话恢复和 stop。
- `oh-my-pi` 同时是共享类型、运行时工厂、服务校验、API descriptor、Web 选择项和文档标识；完整迁移不能只改适配器文件。
- 原生 SDK 已提供 `createAgentSession`、ResourceLoader、SessionManager、内存设置、工具与事件订阅，可复用现有 `AgentRuntime` 契约而无需新增抽象层。
- 现有运行时配置可能持久化旧 kind；迁移时需在“彻底清理旧标识”和“旧数据兼容”之间选择最小安全策略，优先检查存储格式后决定。
- 原生 `SessionManager` 支持 create/open/continueRecent/inMemory；恢复特定会话需要 session 文件路径，可通过固定 sessionDir + `SessionManager.list()` 按 id 查找。
- 原生 SDK 的 `customTools` 可直接承载 Agent Spaces function tools，因此旧的本地 HTTP MCP function-tool bridge 可以删除。
- 原生 SDK 的 ResourceLoader 原生发现 skills/context/extensions；旧适配器中复制技能并补 OMP frontmatter 的大段代码不再需要。
- 旧适配器剩余大量代码仅用于 CLI NDJSON 解析、Windows 可执行文件发现和 OMP YAML/环境生成，原生事件订阅后均应删除。
- SDK 0.74.2 未暴露 MCP server 配置入口，包内也没有 MCP loader；Agent Spaces `functionTools` 可原生化，但任意外部 `mcpServers` 无法无损直传。
- `ModelRegistry.registerProvider()` 支持 baseUrl/apiKey/api/custom model，可把现有 provider/model/baseURL 配置直接注册成 SDK 模型，不再写 models.yml。
- `AuthStorage.setRuntimeApiKey()` 可注入运行时密钥；SettingsManager 可关闭重试/压缩以保持服务端可控。
- SDK `AgentSessionEvent` 复用了 core AgentEvent，包含 message/tool/turn 生命周期，可直接映射现有 `AgentRuntimeEvent`。
- 业务层在多个入口始终传递 agent 配置中的 `mcpServers`，因此“非空即报错”会造成真实功能回退，不可接受。
- 仓库已依赖 `@langchain/mcp-adapters`，LangChainRuntime 已有多 transport MCP 连接逻辑；应复用/提取现有能力并把其 tools 转为 pi custom tools，避免自写 MCP 客户端。
- 所有主要执行入口均通过共享 `createAgentRuntime()`，在共享 factory 替换一次即可覆盖聊天、SSE、团队、工作流和 mini-app。
- `normalizeLangChainMcpServers` 已导出，可直接复用；PiRuntime 只需创建 MultiServerMCPClient、`getTools()` 后把 LangChain tool 的 name/description/schema/invoke 适配成 pi ToolDefinition，并在 finally close。
- LangChain MCP client 已覆盖 stdio/http/sse 与坏 fetch 包兼容，复用它可保持现有 MCP 行为且无需新依赖。
- coding-agent 顶层直接导出 AgentSession/AgentSessionEvent/ToolDefinition/defineTool，PiRuntime 无需依赖其传递依赖的内部类型。
- 现有旧 Pi CLI 适配器未处理 userAttachments，因此本次迁移不新增附件转换，保持当前能力边界。
- runtime 管理路由目前把旧 Pi 当可安装 CLI，并包含 Windows OMP 路径/安装脚本；迁移应改为 SDK descriptor（package `@earendil-works/pi-coding-agent`）并删除 CLI 特判。
- Web runtime 设置把旧 Pi 同时写入 CLI id、supported kind、安装集合和本地缓存校验；需统一改为 SDK id `pi`，避免 UI 继续提示安装 OMP。
- agent prompt 与技能测试只需将运行时名/描述改为原生 Pi；旧 function-tool bridge 的 OMP 前缀兼容测试已与 Pi 无关，应改成一般 MCP 前缀兼容描述或删除该兼容分支。
- Agent 详情页直接展示所有已发现且 supported 的 SDK runtime，不依赖 CLI enabled 开关，因此 Pi descriptor 改为 SDK 后仍可选择。
- Pi SDK 是 server 固定生产依赖，不应继续走 runtime 页面安装/更新 latest；descriptor 仅用于发现已安装版本，Web 安装集合应排除 `pi`，防止升级到不兼容 Node 20 的 0.80.x。
- 全仓（排除 lock、运行数据和计划文件）旧类名、runtime kind、品牌名、OMP 环境变量与 locale key 残留为 0。
- frozen lockfile 离线校验通过，pi SDK 已正确归入 server 生产依赖。
- 工作期间 fitting-room 配置和 workflow lastRunAt 出现并行应用更新；与临时测试目录无关，必须作为用户运行数据保留。
