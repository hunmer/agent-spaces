# Templates 模块 — 概述

## 结构

```
packages/templates/
├── plugins/          # 插件模板
├── skills/           # 技能模板
├── workflow-ui/      # Workflow UI 组件
├── generate-index.mjs # 索引生成
└── pack-mini-apps.mjs # Mini Apps 打包
```

## 构建流程

```bash
pnpm --filter @agent-spaces/agents build
# 等价于: node pack-mini-apps.mjs && node generate-index.mjs
```

## 静态服务

Server 通过 `app.use('/agents-store', express.static(agentsDir))` 提供服务。
