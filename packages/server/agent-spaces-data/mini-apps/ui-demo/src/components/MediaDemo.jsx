const {
  Markdown,
  MermaidPreview,
  Separator,
} = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

const styles = { ...sharedStyles };

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

const markdownContent = `# AgentSpacesUI 组件库

## 简介

AgentSpacesUI 提供了 **237 个**高质量 React 组件，开箱即用。

### 特性

- 🎨 基于 Radix UI 原语构建
- 📱 完全可访问性支持
- 🌗 支持深色/浅色主题
- 📦 零依赖，直接从全局对象解构使用

### 代码示例

\`\`\`javascript
const { Button, Card } = window.AgentSpacesUI;

function App() {
  return (
    <Card>
      <Button>点击我</Button>
    </Card>
  );
}
\`\`\`

### 表格示例

| 组件类型 | 数量 | 说明 |
|---------|------|------|
| 按钮     | 6    | 包含各种变体 |
| 表单     | 15+  | 输入、选择等 |
| 导航     | 10+  | 标签页、面包屑等 |

> 💡 提示：所有组件都支持完整的 TypeScript 类型提示。

---

*更多组件请参考官方文档。*
`;

const mermaidCode = `graph TD
    A[用户请求] --> B{认证检查}
    B -->|已认证| C[加载用户数据]
    B -->|未认证| D[重定向登录]
    C --> E[渲染仪表板]
    D --> F[显示登录表单]
    F --> G[提交凭据]
    G --> H{验证}
    H -->|成功| C
    H -->|失败| F
    E --> I[用户操作]
    I --> J[API 调用]
    J --> K[更新状态]
    K --> E`;

const flowchartCode = `flowchart LR
    A[开始] --> B[处理数据]
    B --> C{判断条件}
    C -->|是| D[执行操作 A]
    C -->|否| E[执行操作 B]
    D --> F[结束]
    E --> F`;

export default function MediaDemo() {
  return (
    <div>
      <Section title="Markdown 渲染器">
        <div style={styles.subtitle}>支持标题、列表、代码块、表格、引用等语法</div>
        <div style={{
          border: "1px solid hsl(var(--border))",
          borderRadius: 8,
          padding: 16,
          maxHeight: 480,
          overflow: "auto",
        }}>
          <Markdown>{markdownContent}</Markdown>
        </div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Mermaid 图表">
        <div style={styles.subtitle}>流程图 — 用户认证流程</div>
        <div style={{
          border: "1px solid hsl(var(--border))",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}>
          <MermaidPreview code={mermaidCode} />
        </div>

        <div style={styles.subtitle}>流程图 — 简单决策 (从左到右)</div>
        <div style={{
          border: "1px solid hsl(var(--border))",
          borderRadius: 8,
          padding: 16,
        }}>
          <MermaidPreview code={flowchartCode} />
        </div>
      </Section>
    </div>
  );
}
