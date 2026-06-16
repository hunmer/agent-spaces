# Mini-app 商店详情页（README 介绍）设计

- **日期**：2026-06-16
- **范围**：`packages/templates/`（打包 + 索引脚本）、`packages/web/`（商店对话框）
- **目标**：让每个 mini-app 模板可附带一份 README 介绍；商店卡片可点进详情页，左侧展示插件元信息，右侧用 Markdown 渲染 README。

## 1. 背景与现状

- 前端商店只读 `mini-app/index.json`（经 `fetchStoreIndex('mini-app/index.json')`）。
- 该 index.json 由 `packages/templates/generate-index.mjs` 的 `scanMiniAppStore` **从 zip 内的 `manifest.json` 提取字段**生成，**不是** `pack-mini-apps.mjs` 生成。
- `pack-mini-apps.mjs` 只产 zip，用 `KEEP_FIELDS` 白名单控制哪些字段进 zip 的 `manifest.json`。
- 商店 URL base（`agent-store.ts` `getStoreApiBase()`）默认指向 `.../packages/templates/`，因此 `intro/{id}.md` 必须落到 `packages/templates/mini-app/intro/{id}.md` 才能被前端 fetch。
- 当前源 app 目录（`packages/server/agent-spaces-data/mini-apps/{id}/`）**尚无任何 README.md**，本特性为新增能力。

## 2. 决策摘要（来自澄清）

| 决策点 | 选择 |
|--------|------|
| 数据链路 | pack 把 `hasIntro` 写入 zip manifest + 复制 README 到商店 `intro/{id}.md`；改 generate-index 透出 `hasIntro` |
| 源 README 处理 | **复制保留**（不删源），可重复发布、幂等 |
| 详情入口 | **整张卡片可点击**进详情；导入按钮 `stopPropagation` |
| 无 README 时 | 仍可进详情，右侧显示「暂无介绍」占位 |
| 左侧字段 | type / version / tags / description（完整）/ updatedAt（本地日期） |
| 左侧 description 位置 | 放在名称下方（元信息分隔线之上） |
| updatedAt 格式 | 本地日期（`YYYY/MM/DD`） |

## 3. 数据流

```
源 app/{id}/README.md
   │  pack-mini-apps.mjs
   ├─► manifest.hasIntro = true  ──► 打进 {id}.zip（KEEP_FIELDS 加 'hasIntro'）
   └─► 复制到 商店 mini-app/intro/{id}.md
         │  generate-index.mjs scanMiniAppStore（解 zip manifest）
         ▼
   商店 mini-app/index.json 增加 hasIntro / version / tags
         │  前端 fetchStoreIndex
         ▼
   详情页读 hasIntro ─► fetch mini-app/intro/{id}.md ─► <Markdown content={md} />
```

## 4. 后端改动

### 4.1 `packages/templates/pack-mini-apps.mjs`

在 `for (const id of projects)` 循环内、构建 `manifest` 之后、写 zip 之前：

1. `KEEP_FIELDS` 数组增加 `'hasIntro'`。
2. 检测 `{projectDir}/README.md` 是否存在：
   - **存在** →
     - `manifest.hasIntro = true`
     - 将 README 内容复制到 `join(out, 'intro', `${id}.md`)`，目标目录用 `mkdirSync(join(out, 'intro'), { recursive: true })`。
   - **不存在** → 不设 `hasIntro`（manifest 不含该字段）。

幂等性：每次 pack 都以源 README 为准覆盖 `intro/{id}.md`；源 README 不删。

### 4.2 `packages/templates/generate-index.mjs`

`scanMiniAppStore` 解析 zip 内 `manifest.json` 后，从 manifest 额外提取 `version`、`tags`、`hasIntro`，写入 index 项：

```js
index.push({
  id, name, type, icon, iconUrl, description,
  hasIntro: manifest.hasIntro === true,   // 规范化为布尔；旧数据/无 README → false
  version: manifest.version,
  tags: Array.isArray(manifest.tags) ? manifest.tags : [],
  zipUrl: `mini-app/${entry.name}`, md5, updatedAt,
});
```

> `version`、`tags` 已在 pack 的 `KEEP_FIELDS` 中，zip manifest 已含；此处仅透出到商店 index.json。

## 5. 前端改动

### 5.1 `mini-apps-store-dialog.tsx`

#### 数据模型
`MiniAppIndexItem` 增加可选字段：
```ts
interface MiniAppIndexItem {
  id: string;
  name: string;
  type?: 'react' | 'html';
  icon?: string;
  iconUrl?: string;
  description?: string;
  zipUrl?: string;
  md5?: string;
  updatedAt?: string;
  hasIntro?: boolean;   // 新增
  version?: string;     // 新增
  tags?: string[];      // 新增
}
```

#### 状态
- `selected: MiniAppIndexItem | null` —— null 显示列表，非 null 显示详情。
- `intro: { loading: boolean; content: string; error: string | null }` —— README 拉取状态。

进入详情时（`setSelected(item)`）触发拉取：仅当 `item.hasIntro === true` 时 `fetch(resolveStoreUrl('mini-app/intro/' + item.id + '.md'))`，`res.text()` 取文本；非 200 → error 态。用 `useEffect` 监听 `selected?.id` 与 `selected?.hasIntro`。

#### 视图切换
- `selected === null` → 现有网格列表（卡片渲染略调，见下）。
- `selected !== null` → 详情视图（同一 Dialog 体内）。

#### 列表卡片
- 卡片根 `div` 加 `onClick={() => setSelected(item)}` 与 `cursor-pointer`。
- 导入 `Button` 的 `onClick` 包一层 `e.stopPropagation()` 后再调 `handleImport`。

#### 详情视图布局（flex 两栏，复用 Dialog 的 80vw×80vh）
```
┌────────────────────────────────────────────────┐
│ ← 返回列表                                       │ 顶部按钮
├────────────────┬───────────────────────────────┤
│   [大图标]      │                               │
│   插件名称      │   <Markdown content={intro}>  │ 右 flex-1 + ScrollArea
│   (居中)        │   hasIntro=false → 暂无介绍    │
│   description   │                               │
│   ─────────     │                               │
│   类型: react   │                               │ 左侧固定 ~ w-60
│   版本: 1.0.0   │                               │
│   标签: a, b    │                               │
│   更新: 06/16   │                               │
└────────────────┴───────────────────────────────┘
```

**左侧（垂直堆叠，居中对齐）：**
- `AgentIcon` 大尺寸（`size-16`），名称加粗居中。
- 名称正下方：`description`（完整、`text-muted-foreground text-sm`，无截断）。
- 分隔线（`border-t my-3`）。
- 元信息逐行（标签 `text-xs text-muted-foreground` + 值 `text-sm`）：类型、版本、标签（逗号连接）、更新时间。
  - `updatedAt` 格式化为本地日期 `YYYY/MM/DD`（补零）。实现：`new Date(updatedAt)` 取 `getFullYear()/getMonth()+1/getDate()`，各段 `padStart(2, '0')` 拼接；避免 `toLocaleDateString` 在不同 locale/月份位数下的不一致。

**右侧：**
- `hasIntro=true` 且 content 就绪 → `<Markdown content={intro.content} />`。
- `hasIntro=true` loading → 居中 spinner + 「加载中…」。
- `hasIntro=true` error → 居中「加载失败」。
- `hasIntro=false` → 居中「暂无介绍」。
- 用 `ScrollArea` 包裹。

#### Markdown 组件
复用 `@/components/ui/markdown.tsx` 的 `Markdown`，仅传 `content`（`workspaceId` 不需要）。

### 5.2 i18n

`mini-apps` 命名空间新增 `detail` 子对象（zh / en）：

```jsonc
"detail": {
  "back": "返回列表",
  "loading": "加载中…",
  "error": "加载失败",
  "empty": "暂无介绍",
  "type": "类型",
  "version": "版本",
  "tags": "标签",
  "updatedAt": "更新时间"
}
```

英文对应：`Back` / `Loading...` / `Failed to load` / `No introduction` / `Type` / `Version` / `Tags` / `Updated`。

## 6. 验证

1. 在某 app（如 `podcast_generator`）根目录加一份 `README.md`（含标题与正文）。
2. `pnpm --filter @agent-spaces/agents pack-mini-apps` → 确认：
   - `packages/templates/mini-app/intro/podcast_generator.md` 生成且内容 = README。
   - `packages/templates/mini-app/podcast_generator.zip` 内 `manifest.json` 含 `"hasIntro": true`。
3. `pnpm --filter @agent-spaces/agents generate-index` → 确认 `packages/templates/mini-app/index.json` 中 podcast_generator 项含 `hasIntro: true / version / tags`。
4. 无 README 的 app（如 `tts`）→ index.json 该项 `hasIntro: false`，无 `intro/tts.md`。
5. `pnpm --filter @agent-spaces/web build`（或 lint）通过，无类型错误。
6. 手动：打开商店 → 点卡片进详情 → 左侧元信息正确、右侧渲染 README；点无 README 的卡片 → 右侧「暂无介绍」；返回按钮回列表；导入按钮不误触发详情。

## 7. 非目标 / YAGNI

- 不做 README 的 i18n 多语言（单一 `{id}.md`）。
- 不把 enabledPlugins / enableAgents 透出到详情左侧（成本高、信息敏感，跳过）。
- 不新增独立路由或独立 Dialog；详情页是同 Dialog 内视图切换。
- 不修改 zip 内其它结构或导入逻辑。
