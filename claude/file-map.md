# 文件索引

## 根目录

```
agent_spaces/
├── AGENTS.md                    # AI Agent 工作指令
├── CLAUDE.md                    # 本索引文件
├── claude/                      # 详情文件目录
├── pnpm-workspace.yaml          # Workspace 定义
├── pnpm-lock.yaml               # 锁文件
├── docker-compose.yml           # Docker 部署
├── Dockerfile.server            # Server Dockerfile
├── .github/workflows/           # CI/CD
│   ├── docker-build.yml         # Docker 镜像构建
│   ├── release.yml              # GitHub Release
│   └── deploy-docs.yml          # 文档部署
├── scripts/                     # 构建辅助脚本
│   ├── copy-package.mjs         # Server 发布包准备
│   ├── copy-web.mjs             # Web 静态输出分发
│   └── test-agent-sse.mjs       # SSE 测试
├── packages/                    # 主要包
│   ├── web/                     # 前端 SPA
│   ├── server/                  # 后端服务
│   ├── electron/                # Electron 桌面壳
│   ├── sdk/                     # 前端 API SDK
│   ├── shared/                  # 共享类型
│   ├── templates/               # 模板/插件/技能打包
│   ├── dom-inspector-hook/      # 开发工具 Hook
│   └── flutter/                 # Flutter 移动壳
└── documents/                   # Docusaurus 文档站
```

## packages/web 关键目录

```
src/
├── app/                         # Next.js App Router 页面
├── components/                  # UI 组件（25+ 子域）
│   ├── chat/                    # 聊天组件
│   ├── editor/                  # Monaco 编辑器
│   ├── workflow/                # Workflow 编辑器
│   ├── settings/                 # 设置页面组件
│   ├── terminal/                # 终端组件
│   ├── sidebar/                 # 侧边栏
│   ├── ui/                      # 基础 UI 组件
│   └── ...                      # 更多功能域
├── stores/                      # Zustand 状态（30+）
├── hooks/                       # React Hooks
├── lib/                         # 工具函数（SDK 初始化、Monaco 配置等）
├── types/                       # 前端类型
├── i18n/                        # 国际化配置
└── locales/                     # 语言文件
```

## packages/server 关键目录

```
src/
├── app.ts                       # 主入口
├── routes/                      # 30+ REST 路由
├── services/                    # 业务逻辑（90+ 文件）
│   ├── builtin-tools/           # 内置工具
│   ├── notification-hub/         # 通知中心
│   ├── speech-recognition/      # 语音识别
│   ├── subscription/            # 订阅管理
│   └── ...
├── ws/                          # WebSocket 处理
├── agents/                      # Agent 运行时
├── adapters/                    # AI 运行时适配器
├── storage/                     # SQLite/JSON 存储（20+ store）
├── middleware/                   # Express 中间件
├── hooks/                       # Hook 引擎
├── types/                       # Server 类型
└── dev/                         # 开发工具
test/                            # 测试文件（20+）
agent-spaces-data/               # 运行时数据（非源码）
public/                          # 静态资源
```
