# FAQ

## Q: 如何启动开发环境？

需要同时启动 Web 和 Server：

```bash
# 终端 1
pnpm --filter @agent-spaces/server dev    # :3100

# 终端 2
pnpm --filter @agent-spaces/web dev        # :3000
```

Web 通过 `next.config.ts` 的 rewrites 将 `/api/*` 和 `/ws` 代理到 Server。

## Q: Web 如何嵌入桌面/移动壳？

1. `pnpm --filter @agent-spaces/web build`（需 `NEXT_STATIC_EXPORT=1`）
2. `pnpm run copy-web` 将输出复制到 Electron/Flutter/Server
3. Electron 通过本地 HTTP 服务加载；Flutter 通过 WebView 加载

## Q: AI Agent 有哪些运行时？

Server 在 `src/adapters/` 中适配多种 AI Agent SDK：
- **Claude Code SDK** — Anthropic 官方
- **OpenAI Codex SDK**
- **LangChain** — 支持 Anthropic/OpenAI/Google
- **Hermes** — 自研运行时
- **Pi SDK** — `@earendil-works/pi-coding-agent`（原 oh-my-pi 已迁移为 pi）
- **Open Agent SDK** (@codeany)

## Q: 如何添加新的 API 端点？

1. 在 `packages/server/src/routes/` 创建路由文件
2. 在 `packages/server/src/app.ts` 注册路由
3. 在 `packages/shared/src/types/` 添加类型
4. 在 `packages/sdk/src/modules/` 添加 SDK 封装
5. 在 `packages/sdk/src/index.ts` 注册模块

## Q: agent-spaces-data 目录是什么？

`packages/server/agent-spaces-data/` 是运行时数据目录，存储插件、工作流、上传等。不应手动修改，不在版本控制中。

## Q: Docker 部署流程？

```bash
docker compose up
```

Server 镜像内置 Web 前端，单进程服务。CI 在 tag push 时自动构建推送到 ghcr.io。
