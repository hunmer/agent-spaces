# i18n 开发指南

项目使用 [next-intl](https://next-intl.dev/)，翻译文件按命名空间拆分存放在：

```
src/locales/
├── zh/    # 中文（34 个 JSON）
└── en/    # 英文（34 个 JSON）
```

每个 JSON 文件就是一个命名空间，文件名即命名空间名。如 `workflows.json` → 命名空间 `workflows`。

## 快速添加翻译

### 1. 在翻译文件中加 key

`src/locales/zh/workflows.json`:

```json
{
  "myFeature": {
    "title": "我的功能",
    "description": "功能说明"
  }
}
```

`src/locales/en/workflows.json`:

```json
{
  "myFeature": {
    "title": "My Feature",
    "description": "Feature description"
  }
}
```

**两个语言文件必须结构一致。** 缺 key 会在运行时报错。

### 2. 在组件中使用

```tsx
import { useTranslations } from 'next-intl';

function MyComponent() {
  const t = useTranslations('workflows');
  return <h1>{t('myFeature.title')}</h1>;
}
```

`useTranslations('命名空间名')` 加载对应 JSON，`t('dot.separated.key')` 按路径取值。

### 3. 带变量的翻译

翻译文件中用 `{varName}` 占位：

```json
{ "itemCount": "{count} 个项目" }
```

组件中传参：

```tsx
t('itemCount', { count: 42 })
```

## Workflow 节点的 i18n

Workflow 节点定义中的 `label` / `category` / `description` / `tooltip` 字段，如果以 `nodes.` 开头会被 i18n 系统自动翻译（见 `src/lib/workflow-nodes/i18n.ts`），否则直接显示原始字符串作为 fallback。

### 添加新节点的翻译

节点定义中写 i18n key：

```ts
{
  type: 'my_node',
  label: 'nodes.my_node.label',
  category: 'nodes.categories.flowControl',
  description: 'nodes.my_node.description',
  properties: [
    {
      key: 'name',
      label: 'nodes.my_node.props.name',
      tooltip: 'nodes.my_node.props.name_tooltip',
    },
  ],
}
```

在 `workflows.json` 的 `nodes` 下加对应条目：

```json
{
  "nodes": {
    "my_node": {
      "label": "我的节点",
      "description": "节点描述",
      "props": {
        "name": "名称",
        "name_tooltip": "输入名称"
      }
    }
  }
}
```

### 节点分类

分类 key 写 `nodes.categories.xxx`，在 `nodes.categories` 下加翻译：

| key | zh | en |
|-----|----|----|
| `flowControl` | 流程控制 | Flow Control |
| `ai` | AI | AI |
| `interaction` | 交互 | Interaction |
| `display` | 展示 | Display |
| `utilities` | 辅助工具 | Utilities |

## 命名空间列表

当前 34 个命名空间：`agent`、`agentCommands`、`chat`、`commandPalette`、`commands`、`common`、`composer`、`database`、`editor`、`folderPicker`、`git`、`home`、`issue`、`kanban`、`login`、`mcps`、`models`、`outputStyles`、`projectSettings`、`prompts`、`providers`、`robotAccounts`、`settings`、`sidebar`、`skills`、`task`、`terminal`、`tools`、`workflows`、`mini-apps`、`workspaces`、`workspace`、`worktree`。

选命名空间的原则：跟功能域对应，不要往 `common` 里塞功能特定的翻译。
