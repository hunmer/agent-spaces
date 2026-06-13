[根目录](../../CLAUDE.md) > [packages](../) > **templates**

# @agent-spaces/agents

## 模块职责

Agent 预设模板库。提供 400+ 个模板文件，覆盖 Agent 预设（184 个）、Chat Agent 预设（6 个）、MCP 服务器配置（9 个）、Skills（66+ 文件）、Workflow Plugins（120+ 文件）、Workflow 模板、Prompt 模板（2 个）、Output Style 模板（7 个）、Mini-app 模板（1 个）等多种类型。通过 `generate-index.mjs` 自动生成索引文件，支持 Store 在线导入。

## 入口与启动

- **索引入口**：各子目录的 `index.json`（由 `generate-index.mjs` 自动生成）
- **索引生成**：`pnpm generate-index` -- 扫描所有模板目录，解析 YAML frontmatter，生成统一索引
- **本地服务**：`pnpm serve` -- http-server 静态文件服务（端口 3101），供 Store 浏览

## 目录结构

```
templates/
├── agents/          # 184 个 Agent 预设模板（15 个分类）
│   ├── index.json   # 索引文件
│   ├── academic/    # 学术（5）
│   ├── design/      # 设计（8）
│   ├── engineering/ # 工程（29）
│   ├── finance/     # 金融（5）
│   ├── game-development/ # 游戏开发（20）
│   ├── marketing/   # 营销（30）
│   ├── paid-media/  # 付费媒体（7）
│   ├── product/     # 产品（5）
│   ├── project-management/ # 项目管理（6）
│   ├── sales/       # 销售（8）
│   ├── spatial-computing/ # 空间计算（6）
│   ├── specialized/ # 专用（41）
│   ├── support/     # 支持（6）
│   └── testing/     # 测试（8）
├── chat/            # 6 个 Chat Agent 预设模板
│   ├── index.json
│   ├── chat-code-assistant.md        # 编程助手
│   ├── chat-creative-consultant.md   # 创意顾问
│   ├── chat-data-analyst.md          # 数据分析师
│   ├── chat-study-tutor.md           # 学习导师
│   ├── chat-translation-assistant.md # 翻译助手
│   └── chat-writing-assistant.md     # 写作助手
├── mcps/            # 9 个 MCP 服务器模板
│   ├── index.json
│   └── *.json       # brave-search, fetch, filesystem, git, github, memory, puppeteer, sqlite, everything
├── skills/          # 66+ 文件 Skill 模板（**大幅扩展**）
│   ├── index.json
│   ├── caveman/              # SKILL.md
│   ├── grill-me/             # SKILL.md
│   ├── handoff/              # SKILL.md
│   ├── improve-codebase-architecture/ # 5 文件（SKILL/DEEPENING/HTML-REPORT/INTERFACE-DESIGN/LANGUAGE）
│   ├── planning-with-files/  # 含 -zh 版本（10 文件，含 scripts/ + templates/）
│   ├── superpowers/          # 14 子目录（brainstorming/dispatching-parallel-agents/executing-plans/finishing-a-development-branch/receiving-code-review/requesting-code-review/subagent-driven-development/systematic-debugging/test-driven-development/using-git-worktrees/using-superpowers/verification-before-completion/writing-plans/writing-skills）
│   ├── tdd/                  # 6 文件（SKILL/deep-modules/interface-design/mocking/refactoring/tests）
│   └── to-prd/               # SKILL.md
├── plugins/         # 120+ 文件 Plugin 模板（**扩展**）
│   ├── index.json
│   ├── aliyun-ai/   # 20+ 文件（含 refs/ API 参考文档）
│   ├── aliyun_oss/  # 阿里云 OSS
│   ├── tencent_cos/ # 腾讯云 COS
│   ├── desktop-native/
│   ├── dingtalk/    # 钉钉（**新增**）
│   ├── epub-parser/ # EPUB 解析
│   ├── fetch/
│   ├── ffmpeg/
│   ├── file-system/
│   ├── fish-audio/  # Fish Audio TTS
│   ├── jimeng/      # 即梦 AI
│   ├── mail/
│   ├── minimax/     # MiniMax（含 chat/voice/video/image/audio/her）
│   ├── mira-sdk/    # Mira SDK（**新增**）
│   ├── openai/
│   ├── test-plugin/
│   └── window-manager/
├── workflows/       # Workflow 模板
│   ├── index.json
│   └── code-writing.json  # 4 节点 Planner→Executor→Reviewer→Commit
├── prompt/          # 2 个 Prompt 模板
│   ├── index.json
│   ├── andrej-karpathy-skills.md       # 编码行为准则
│   └── claude-token-efficient-coding.md # Token 高效编码
├── output-styles/   # 7 个 Output Style 模板
│   ├── index.json
│   ├── carmack-mode.md       # Carmack 模式
│   ├── codex-rigor-mode.md   # Codex Rigor 模式
│   ├── dhh-mode.md           # DHH 模式
│   ├── evan-you-mode.md      # 尤雨溪模式
│   ├── jobs-mode.md          # Jobs 模式
│   ├── linus-mode.md         # Linus 模式
│   └── uncle-bob-mode.md     # Uncle Bob 模式
├── mini-app/        # Mini-app 模板
│   ├── index.json
│   └── minimax_tts/ # minimax 配音界面（manifest.json + src/index.jsx + avatar.png）
└── generate-index.mjs  # 索引自动生成脚本
```

## 模板格式

### Agent 模板（Markdown + YAML frontmatter）

```markdown
---
name: Agent Name
description: Brief description
color: "#color"
emoji: "🤖"
vibe: Short personality tagline
---

# Agent Name

## 🧠 Your Identity & Memory
## 🎯 Your Core Mission
## 🚨 Critical Rules
## 📋 Core Capabilities
## 🔄 Workflow Process
## 💭 Communication Style
## 🎯 Success Metrics
## 🚀 Advanced Capabilities
```

### Output Style 模板（Markdown + YAML frontmatter）

```markdown
---
name: linus-mode
description: Linus Torvalds 风格 - 直接、高效、代码说话
---

# Linus 模式
> "Talk is cheap. Show me the code."
## 核心原则
## 风格特点
```

### Prompt 模板（纯 Markdown）

行为准则文档，减少 LLM 编码错误（Think Before Coding / Simplicity First / Surgical Changes 等）。

### 索引格式

```json
{
  "id": "engineering-ai-engineer",
  "name": "AI Engineer",
  "group": "engineering",
  "path": "engineering/engineering-ai-engineer",
  "description": "Expert AI/ML engineer...",
  "emoji": "🤖"
}
```

## 依赖

- 无外部依赖（纯静态模板资源）

## 关键设计

- **自动索引**：`generate-index.mjs` 解析 YAML frontmatter 自动生成各子目录 `index.json`
- **分类体系**：Agent 按功能域分为 15 个分类；Skills 按方法论分组（superpowers 14 子目录 + tdd/planning 等）
- **Store 集成**：通过 HTTP 静态服务暴露给 Agent Store 在线导入
- **多模板类型**：统一管理 Agent/ChatAgent/MCP/Skill/Plugin/Workflow/Prompt/OutputStyle/Mini-app 九种模板

## 扫描状态

- **更新时间**：2026-06-13 16:57:29
- **已扫描范围**：全部子目录索引、prompt/output-styles/mini-app/workflows 内容样本确认、skills/plugins 扩展确认
- **覆盖率**：约 90%
- **本次新增**：确认 prompt(2)/output-styles(7)/mini-app(1)/workflows(1) 内容；skills 扩展至 66+；plugins 扩展至 120+
- **仍存缺口**：agents 184 个模板内容未逐一抽样、plugins 各插件的 tools.js/workflow.js 细节未深抽

## 变更记录 (Changelog)

- **2026-06-13**：增量更新。Skills 从 15 扩展至 66+ 文件（新增 caveman/grill-me/handoff/improve-codebase-architecture/tdd/to-prd/planning-with-files-zh）。Plugins 新增 mira-sdk/dingtalk/aliyun_oss/tencent_cos/epub-parser/fish-audio/jimeng/test-plugin。确认 prompt(2)/output-styles(7)/mini-app(1)/workflows(1) 内容样本。覆盖率提升至 90%。
