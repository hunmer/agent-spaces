
# 输出风格管理

输出风格（Output Style）允许你自定义 Agent 的输出格式模板，控制 Agent 回复的结构和样式。

## 核心概念

输出风格是 Markdown 格式的模板，通过 `resolveOutputStyleContent()` 注入到 Agent 的 systemPrompt 中。每个工作空间可以配置不同的输出风格。

## 内置模板

系统内置 **7 个**开发者风格模板（位于 `packages/templates/output-styles/`），可在创建自定义风格时参考或直接复用：

| 模板 | 风格定位 |
|------|----------|
| **carmack-mode** | John Carmack 风格 — 极简、务实、直击性能与本质 |
| **codex-rigor-mode** | Codex Rigor 风格 — 严谨、结构化、强调工程纪律 |
| **dhh-mode** | DHH（David Heinemeier Hansson）风格 — 主观鲜明、重视约定与设计 |
| **evan-you-mode** | 尤雨溪（Evan You）风格 — 平衡、克制、注重渐进与兼容 |
| **jobs-mode** | Steve Jobs 风格 — 极致打磨、聚焦用户体验与取舍 |
| **linus-mode** | Linus Torvalds 风格 — 直接、高效、代码说话 |
| **uncle-bob-mode** | Uncle Bob（Robert C. Martin）风格 — 强调整洁代码与可维护性 |

这些模板可通过 Store 从模板库导入。模板内容采用 Markdown + YAML frontmatter 格式（`name` / `description` 必填）。

## 创建输出风格

1. 在 `/settings/output-styles` 页面点击「创建」
2. 输入风格名称
3. 编写 Markdown 模板内容
4. 保存

### 模板示例

```markdown
## 分析结果

请按以下格式输出：

### 问题分析
{分析内容}

### 修改方案
{具体方案}

### 代码变更
{变更说明}
```

## 应用到 Agent

输出风格通过 Agent 预设配置绑定：

1. 在 Agent 预设中设置 `outputStyle` 字段
2. 选择已创建的输出风格模板
3. Agent 运行时自动将模板注入到 systemPrompt

## 管理输出风格

### 独立设置页

在 `/settings/output-styles` 页面管理所有模板：

- 创建、编辑、删除输出风格
- 预览模板效果
- 查看使用该模板的 Agent 列表

### 侧边栏

在工作空间侧边栏的 Output Styles 对话框中快速管理：

- 查看当前工作空间的输出风格
- 快速切换输出风格
- 编辑模板内容

## 数据持久化

输出风格模板通过 `meta.json` 持久化存储，按工作空间隔离。

## 技术实现

- 模板类型：`OutputStyleTemplate`
- 注入方式：运行时通过 `resolveOutputStyleContent()` 读取模板内容
- 存储路径：工作空间的 `.agentspace` 目录
