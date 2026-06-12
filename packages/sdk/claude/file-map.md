# 文件地图

## 目录结构

```
packages/sdk/
├── package.json              # 包配置（名称、依赖、脚本）
├── tsconfig.json             # TypeScript 编译配置
├── CLAUDE.md                 # AI 上下文索引文件
├── claude/                   # 详情文档目录
│   ├── overview.md           # 架构总览
│   ├── conventions.md        # 开发约定
│   ├── module-responsibilities.md  # 模块职责
│   ├── entrypoints.md        # 入口文件
│   ├── public-interfaces.md  # 公共接口
│   ├── dependencies-and-config.md  # 依赖与配置
│   ├── data-model.md         # 数据模型
│   ├── testing-and-quality.md # 测试与质量
│   ├── file-map.md           # 本文件
│   ├── faq.md                # 常见问题
│   └── changelog.md          # 变更记录
├── src/
│   ├── index.ts              # 主入口（createSDK + 全部导出）
│   ├── client.ts             # HttpClient 实现
│   ├── types.ts              # SDKConfig / ApiError / RequestOptions
│   └── modules/              # 39 个 API 模块适配器
│       ├── agent.ts           # Agent 预设管理
│       ├── agent-commands.ts  # Agent 命令管理
│       ├── agent-store.ts     # Agent 在线商店
│       ├── auth.ts            # 认证
│       ├── avatar.ts          # 头像
│       ├── channel.ts         # 频道聊天
│       ├── code-favorites.ts  # 代码收藏
│       ├── command.ts         # 快速命令
│       ├── data.ts            # 数据导入导出
│       ├── database.ts        # 文档数据库
│       ├── editor.ts          # 文件编辑器
│       ├── font.ts            # 字体管理
│       ├── git.ts             # Git 操作
│       ├── hooks.ts           # Hook 管理
│       ├── inspector.ts       # DOM Inspector
│       ├── issue.ts           # Issue 管理
│       ├── kanban.ts          # 看板
│       ├── llm.ts             # LLM 模型/供应商
│       ├── mcps.ts            # MCP 服务器
│       ├── npm-settings.ts    # NPM 设置
│       ├── notification.ts    # 通知
│       ├── output-styles.ts   # 输出风格
│       ├── prompts.ts         # Prompt 模板
│       ├── robot-accounts.ts  # 机器人账号
│       ├── search.ts          # 搜索
│       ├── skills.ts          # Skills 管理
│       ├── speech.ts          # 语音识别
│       ├── subscription.ts    # 订阅
│       ├── task.ts            # Task 管理
│       ├── tools.ts           # 内置工具
│       ├── version.ts         # 版本
│       ├── worktree.ts        # Git Worktree
│       ├── workspace.ts       # 工作空间
│       ├── workflow.ts        # Workflow
│       ├── workflow-plugin.ts # Workflow 插件
│       ├── mini-app.ts     # Workflow UI 项目
│       └── chat.ts            # Chat Agent
└── dist/                     # 构建产物（不纳入版本控制）
```

## 文件统计

| 类别 | 文件数 |
|------|--------|
| 核心源文件（src/） | 42（3 核心 + 39 模块） |
| 配置文件 | 2（package.json + tsconfig.json） |
| 文档文件（claude/） | 12 |
| 构建产物（dist/） | 约 120+（自动生成） |

## 关键文件说明

| 文件 | 行数 | 重要性 | 说明 |
|------|------|--------|------|
| `src/index.ts` | 213 | 核心 | SDK 唯一入口，组装所有模块 |
| `src/client.ts` | 245 | 核心 | HttpClient 实现，所有请求的底层 |
| `src/types.ts` | 39 | 基础 | SDK 配置和错误类型 |
| `src/modules/git.ts` | 102 | 最大模块 | 26 个方法，覆盖完整 Git 操作 |
| `src/modules/chat.ts` | 146 | 复杂 | 独立聊天系统，17 个方法 |
| `src/modules/workflow.ts` | 109 | 复杂 | 18 个方法，含版本/日志/暂存 |
| `src/modules/editor.ts` | 73 | 中等 | 13 个方法，文件树和编辑器状态 |
