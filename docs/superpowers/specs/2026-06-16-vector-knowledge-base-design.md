# 向量知识库子系统设计

- **日期**：2026-06-16
- **状态**：已设计，待实现
- **范围**：在 Agent Spaces 平台新增一个独立的、文件导向的向量知识库子系统，包含 3 个工作流节点、3 个前端对话框、完整的后端存储/服务/路由/SDK

## 1. 目标与背景

平台已有一个「文档数据库（Notion 风格树形文档）+ 向量搜索」子系统（`database-vector.ts`），按文档节点做整体嵌入。本设计新增一个**独立的文件导向向量知识库**，与文档数据库并存，面向 RAG 场景：上传真实文件 → 解析 → 分块 → 嵌入 → 检索，并暴露为工作流节点。

两个向量子系统共享同一份嵌入 util（从 `database-vector.ts` 抽离）。

### 关键决策（已与需求方确认）

1. **新建独立知识库资源**，不复用文档数据库
2. **完整文件 RAG**：上传真实文件，系统解析 + 分块 + 嵌入，文件本体留存
3. **设置对话框实质是选 embedding 模型**（后端存 `embeddingModelId`），UI 借用 `AgentPickerDialog` 交互形式，`agents` 列表由 `models.filter(embedding)` 构造
4. **「加入知识库」节点从上游变量读取文件路径**（workspace 相对路径 / URL），后端读取/下载后解析加入
5. **自动索引**：文件加入后立即异步解析+嵌入，每文件独立状态流转 `pending → indexing → indexed | failed`
6. **首版仅支持文本类文件解析**（txt/md/csv/html/json/log/xml），不引入 pdf/docx 解析依赖；非文本格式文件本体仍存储但标记 `failed`，架构留扩展点
7. **工作流 `kb_add` 节点同步等待索引完成**（节点输出含准确 `chunkCount/status`）

## 2. 架构总览与数据模型

### 2.1 数据模型（3 个实体，存储仿现有 `database-store` 风格）

**KnowledgeBase（库元数据，JSON：`~/.agent-spaces-data/knowledge-bases/<kbId>/meta.json`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 标识 |
| `name` | string | 名称 |
| `description` | string | 描述 |
| `embeddingModelId` | string \| null | 绑定的 embedding 模型 |
| `chunkSize` | number | 库级分块大小（默认 1000 字符） |
| `chunkOverlap` | number | 库级分块重叠（默认 200 字符） |
| `createdAt` / `updatedAt` | string (ISO) | 时间戳 |

**KbFile（文件记录，JSON：`<kbId>/files.json`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 标识 |
| `kbId` | string | 所属库 |
| `fileName` | string | 文件名 |
| `mimeType` | string | MIME 类型 |
| `size` | number | 字节大小 |
| `sourceType` | `'upload' \| 'path' \| 'url'` | 来源（详情对话框=upload，工作流=path/url） |
| `sourceRef` | string | 原始路径/URL（溯源） |
| `storagePath` | string | 文件本体相对路径（`<kbId>/files/<fileId>.<ext>`） |
| `extractedText` | string | 解析出的纯文本（供右侧展示 + 分块） |
| `chunkCount` | number | 分块数 |
| `indexStatus` | `'pending' \| 'indexing' \| 'indexed' \| 'failed'` | 单文件索引状态 |
| `indexError` | string \| null | 失败原因 |
| `indexedAt` | string \| null (ISO) | 完成时间 |
| `createdAt` / `updatedAt` | string (ISO) | 时间戳 |

**KbChunk + Embedding（向量，SQLite，仿 database embeddings 表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `chunkId` | string | 标识 |
| `kbId` | string | 所属库 |
| `fileId` | string | 所属文件 |
| `chunkIndex` | number | 块序号 |
| `text` | string | 块文本 |
| `contentHash` | string | 内容哈希（去重/失效判断） |
| `embedding` | string (JSON) | 向量，JSON 字符串存储 |
| `modelId` | string | 嵌入时所用模型（换模型时可据此失效） |
| `createdAt` | string (ISO) | 时间戳 |

### 2.2 模块划分

| 层 | 文件 | 职责 |
|----|------|------|
| 共享 | `packages/shared/src/types/knowledge-base.ts` | KB / KbFile / KbChunk / 状态枚举 / 路由 DTO 类型 |
| 后端存储 | `packages/server/src/storage/knowledge-base-store.ts` | KB/File CRUD（JSON）+ chunks/embeddings CRUD（SQLite） |
| 后端服务 | `packages/server/src/services/knowledge-base.ts` | 业务核心：加文件、解析、分块、嵌入、查询、删除、重试；同步/异步两入口 |
| 后端服务 | `packages/server/src/services/knowledge-base-parser.ts` | 文件解析 + 分块 |
| 后端服务 | `packages/server/src/services/embedding-util.ts` | **共享嵌入 util**（从 database-vector 抽离） |
| 后端路由 | `packages/server/src/routes/knowledge-base.ts` | REST 路由 |
| 后端执行 | `packages/server/src/services/execution-kb-nodes.ts` | 3 个工作流节点执行函数（仿 `execution-sqlite-nodes.ts`） |
| SDK | `packages/sdk/src/modules/knowledge-base.ts` | 前端 API 模块 |
| 前端节点 | `packages/web/src/lib/workflow-nodes/definitions/knowledge-base.ts` | 3 个节点定义 |
| 前端控件 | `packages/web/src/components/workflow/workflow-fields-knowledge-base.tsx` | `KnowledgeBasePicker` |
| 前端对话框 | `packages/web/src/components/workflow/knowledge-base-list-dialog.tsx` | 列表对话框 |
| 前端对话框 | `packages/web/src/components/workflow/knowledge-base-detail-dialog.tsx` | 详情对话框 |
| 前端对话框 | `packages/web/src/components/workflow/knowledge-base-settings-dialog.tsx` | 设置对话框 |
| i18n | `packages/web/src/locales/{en,zh}/knowledgeBase.json` + 扩展 `nodes.json` | 文案 |

### 2.3 关键复用点

- 嵌入请求 / `cosineSimilarity` / `getEmbeddingsUrl` / `requireEmbeddingModelConfig`：抽离为 `embedding-util.ts`，`database-vector.ts` 同时改为引用
- `workflow-fields-property.tsx`：新增 `case 'knowledge-base'`（仿 `case 'sqlite'`）
- `AgentPickerDialog`：设置对话框复用其交互
- `SqliteDatabasePicker` / `SqliteDatabaseListDialog`：`KnowledgeBasePicker` / `KnowledgeBaseListDialog` 的结构范本

## 3. 后端详细设计

### 3.1 存储层 `storage/knowledge-base-store.ts`

```
KB:     createKb(wsId,data) / getKb(wsId,kbId) / listKbs(wsId) / updateKb(wsId,kbId,patch) / deleteKb(wsId,kbId)
File:   addFile(wsId,kbId,file) / getFile(wsId,kbId,fileId) / listFiles(wsId,kbId) / updateFileStatus(wsId,kbId,fileId,patch) / deleteFile(wsId,kbId,fileId)
向量:   upsertChunk(wsId,kbId,chunk) / listChunks(wsId,kbId,fileId?) / deleteFileChunks(wsId,kbId,fileId) / searchChunks(wsId,kbId,queryVec,limit)
统计:   getKbStats(wsId,kbId) → { fileCount, indexedCount, pendingCount, failedCount, chunkCount }
```

KB/File 以 JSON 持久化（与 database-store 一致），chunks/embeddings 以 SQLite 持久化。workspace 维度隔离（与文档数据库一致）。

### 3.2 共享嵌入 util `services/embedding-util.ts`（新文件）

从 `database-vector.ts` 抽离为纯函数，`database-vector.ts` 与 `knowledge-base.ts` 共用：

```
requireEmbeddingModelConfig(modelId) → { model, provider }
embedTexts(config, input[]) → number[][]     // POST /embeddings + 解析 + 长度校验
cosineSimilarity(a, b) → number
getEmbeddingsUrl(apiBase) → string
hashText(text) → string
```

`database-vector.ts` 删除上述函数体，改为 `import { ... } from './embedding-util.js'`。`DatabaseVectorError` / `DatabaseVectorDebug` 类型一并迁移或共享。

### 3.3 解析 + 分块 `services/knowledge-base-parser.ts`（新文件）

```
extractText(filePath, mimeType?) → string
  - .txt/.md/.markdown/.csv/.html/.htm/.json/.log/.xml → fs.readFileSync(path,'utf8')
  - 其余（pdf/docx/未知）→ 抛错 { code:'UNSUPPORTED_FORMAT' }
chunkText(text, { size=1000, overlap=200 }) → string[]
  - 字符滑窗：步长 = size - overlap，末块不足 size 也保留
```

### 3.4 服务层 `services/knowledge-base.ts`（新文件，业务核心）

```
addFileToKnowledgeBase(wsId, kbId, { sourceType, sourceRef, fileName?, uploadBuffer? }) → KbFile
  1. 读取/下载文件（upload=入参 buffer；path=workspace 内读；url=fetch）→ 写 storagePath
  2. addFile(status='pending')
  3. updateFileStatus('indexing')
  4. extractText + chunkText
  5. embedTexts 批量嵌入（INDEX_BATCH_SIZE=16，复用常量）
  6. upsertChunk（每块）+ updateFileStatus('indexed', chunkCount, indexedAt)
     任一步抛错 → updateFileStatus('failed', indexError) 并**吞没异常**，返回 status='failed' 的 KbFile（不向上抛出）
     ——调用方据 `file.indexStatus` 判断成败：工作流 kb_add 据此输出 `status:'failed'` 且不中断工作流；详情对话框据徽章展示

queryKnowledgeBase(wsId, kbId, query, topK=5) → matches[]
  - 校验 embeddingModelId 已绑定；embedTexts(query) → 对 listChunks 做 cosine → 排序截断 topK
  - 返回 [{ fileId, fileName, chunkIndex, chunkText, score }]

deleteFileFromKb(wsId, kbId, fileId) → { deletedChunks }
  - 删文件本体 + deleteFileChunks + deleteFile

reindexFile(wsId, kbId, fileId) → 等价于对该文件重跑步骤 3-6

两种调用方式：
  · 工作流 kb_add：await 完整流程
  · 详情对话框上传/重试：fire-and-forget（立即返回 pending 的 KbFile，索引在后台进行）
```

### 3.5 路由 `routes/knowledge-base.ts`（仿 `routes/database.ts`）

所有路由前缀 `/api/workspaces/:wid/knowledge-bases`，Bearer 鉴权 + zod 校验：

```
GET    /                              列出知识库
POST   /                              新建（name, description, chunkSize?, chunkOverlap?）
PUT    /:kbId                         更新（name, description, chunkSize, chunkOverlap, embeddingModelId）
DELETE /:kbId                         删除知识库（含文件与向量）
GET    /:kbId/stats                   统计
GET    /:kbId/files                   列出文件
POST   /:kbId/files                   加入文件（multipart 上传 或 JSON {sourceType,sourceRef,fileName}）
GET    /:kbId/files/:fileId           取单个文件（含 extractedText）
DELETE /:kbId/files/:fileId           删除文件
POST   /:kbId/files/:fileId/reindex   重试索引
POST   /:kbId/query                   { query, topK? }
PUT    /:kbId/embedding-model         { embeddingModelId }  （设置对话框保存绑定）
```

### 3.6 SDK `sdk/modules/knowledge-base.ts`（仿 database 模块）

```
list(wsId) / create(wsId,data) / update(wsId,kbId,patch) / delete_(wsId,kbId)
stats(wsId,kbId)
listFiles(wsId,kbId) / addFile(wsId,kbId,body|FormData) / getFile(wsId,kbId,fileId) / deleteFile(wsId,kbId,fileId) / reindexFile(wsId,kbId,fileId)
query(wsId,kbId,{query,topK})
bindEmbeddingModel(wsId,kbId,embeddingModelId)
```

在 `createSDK` 中注册 `knowledgeBase` 字段。

### 3.7 工作流执行 `execution-kb-nodes.ts` + `execution-manager.ts`

`execution-manager.ts` 的 `dispatchNode` switch 增加：

```
case 'kb_add':    return executeKbAdd(resolvedData);
case 'kb_query':  return executeKbQuery(resolvedData);
case 'kb_delete': return executeKbDelete(resolvedData);
```

`resolvedData` 已由 `resolveContextVariables` 解析上下文变量，故 `filePath` / `query` / `fileId` 可经 `{{upstream.field}}` 注入。

## 4. 前端工作流节点定义

新增 `lib/workflow-nodes/definitions/knowledge-base.ts`（仿 `sqlite.ts`）：

```ts
const KB_PROP = {
  key: 'knowledgeBase',
  label: 'nodes.kb.props.knowledgeBase',
  type: 'knowledge-base' as const,
  required: true,
  tooltip: 'nodes.kb.props.knowledgeBase_tooltip',
};

// kb_add
properties: [ KB_PROP,
  { key: 'filePath', type: 'text', required: true, tooltip: '上游变量解析的文件路径(workspace相对路径/URL)' },
  { key: 'fileName', type: 'text', tooltip: '可选,自定义存储文件名' } ]
outputs: [ {key:'fileId',type:'string'}, {key:'fileName',type:'string'}, {key:'chunkCount',type:'number'}, {key:'status',type:'string'} ]

// kb_query
properties: [ KB_PROP,
  { key: 'query', type: 'textarea', required: true },
  { key: 'topK', type: 'number', default: 5 } ]
outputs: [ {key:'matches',type:'any'}, {key:'count',type:'number'} ]

// kb_delete
properties: [ KB_PROP,
  { key: 'fileId', type: 'text', required: true, tooltip: '上游变量的文件id;多个用逗号或数组' } ]
outputs: [ {key:'deletedCount',type:'number'} ]
```

`kb_query.matches` 每项结构：`{ fileId, fileName, chunkIndex, chunkText, score }`。

### 配套改动

| 文件 | 改动 |
|------|------|
| `packages/shared/src/types/workflow.ts` (NodePropertyType 联合, 第 207 行) | 增加 `'knowledge-base'` |
| `definitions/index.ts` | `export { knowledgeBaseNodes } from './knowledge-base'` |
| `workflow-fields-property.tsx` | `case 'knowledge-base'` → `<KnowledgeBasePicker />` |
| `workflow-fields-knowledge-base.tsx`（新） | `KnowledgeBasePicker`：按钮 → `KnowledgeBaseListDialog`(pick 模式) → 回调 kbId；workspaceId 取自当前 workspace store |

> 知识库选择器用专属 `type:'knowledge-base'` 控件而非 `select+dynamicOptions`，因知识库列表是 workspace 维度，现有 `useDynamicOptions` hook 是 dbId 维度（sqlite 专属）不适用。

## 5. 前端对话框

### 5.1 `KnowledgeBaseListDialog`（列表对话框）

仿 `SqliteDatabaseListDialog`。pick 模式供 `KnowledgeBasePicker` 复用，管理模式供知识库管理入口使用。

- 列出当前 workspace 所有知识库：name / description / fileCount / indexedCount / 绑定 embedding 模型名
- 操作：`+ 新建`（名 + 描述）、行内`打开详情`、`删除`
- pick 模式：点行回调 kbId

### 5.2 `KnowledgeBaseDetailDialog`（详情对话框）

仿 `sqlite-data-browser-dialog` 双栏布局：

```
┌─ DialogHeader: 「<KB 名>」                    [⚙ 设置] [×] ┐
├───────────────────┬─────────────────────────────────────┤
│ 左:文件列表        │ 右:选中文件内容                       │
│ [+ 加入文件]       │  顶部:fileName/size/mimeType/         │
│ 📄 a.txt  ●已索引  │       chunkCount/sourceRef            │
│ 📄 b.md  🟡索引中  │  extractedText 只读预览               │
│ 📄 c.csv  ✕失败    │  (暂不支持格式→文件信息+提示)          │
│   [重试][删除]     │                                      │
└───────────────────┴─────────────────────────────────────┘
```

- 左侧行：fileName + **indexStatus 徽章**（`indexed` 绿 / `pending` 灰 / `indexing` 蓝转圈 / `failed` 红 + 错误 tooltip）；`failed` 显示`重试`(reindexFile)；每行`删除`
- `[+ 加入文件]`：multipart 上传 → 后端 fire-and-forget → 前端轮询 listFiles（每 2s，仅当存在 pending/indexing）刷新徽章
- `⚙ 设置`：打开 `KnowledgeBaseSettingsDialog`
- 尺寸：`!h-[80vh] !w-[80vw]`（仿 sqlite 浏览器）

### 5.3 `KnowledgeBaseSettingsDialog`（设置对话框）

用 `AgentPickerDialog` 形式选 embedding 模型：

- 展示当前绑定模型（name + provider）；`[更换嵌入模型]` 打开 `AgentPickerDialog`
  - `agents = models.filter(m => m.embedding).map(m => ({ id: m.id, name: m.name, description: \`${m.provider}/${m.modelId}\` }))`
  - `singleSelect`，`onSubmit([modelId])` → `bindEmbeddingModel(kbId, modelId)`（**实质存模型 id**）
  - `models` 取自前端 llm models store
- 库级分块参数：`chunkSize`（默认 1000）/ `chunkOverlap`（默认 200）number 输入
- `[保存]` → `update(kbId, { chunkSize, chunkOverlap })`

## 6. i18n / 错误处理 / 测试 / 验收

### 6.1 i18n

- 新命名空间 `locales/{en,zh}/knowledgeBase.json`（列表/详情/设置对话框全部文案，含 indexStatus 徽章文案）
- 扩展 `nodes.json`：`categories.knowledgeBase` + `kb_add/kb_query/kb_delete` 的 `label/description` + `kb.props.*`

### 6.2 错误处理

- 解析失败（含 `UNSUPPORTED_FORMAT`）→ `indexStatus=failed` + `indexError`，不阻断同库其它文件
- 嵌入 API 失败 → `failed` + debug（复用 `DatabaseVectorError` 模式）
- 查询时未绑定 embedding 模型 → 抛错（仿 `database-vector`）
- 路由层 zod 校验 + Bearer 鉴权（与现有路由一致）；越界保护沿用 `safeSrcPath`（path 来源文件读取）

### 6.3 测试（server）

- `knowledge-base-parser`：`extractText`（各文本类正常 + 不支持格式抛 `UNSUPPORTED_FORMAT`）、`chunkText`（边界、overlap、空文本）单元测试
- `knowledge-base-store`：KB/File CRUD、chunks upsert/list/delete
- `execution-kb-nodes`：三节点 resolvedData → 输出契约（add 返回 fileId/chunkCount/status；query 返回 matches/count；delete 返回 deletedCount）

### 6.4 验收

- 3 节点在工作流中可配置并执行：`kb_add` → `kb_query` → `kb_delete` 闭环
- 列表/详情/设置三对话框可用：上传文本文件 → 自动索引 → 徽章流转 `pending→indexing→indexed` → 查询命中
- 暂不支持格式（如 pdf）文件可上传入库、显示 `failed` + "暂不支持该格式解析" 提示
- 抽离 `embedding-util` 后，文档数据库向量功能回归正常（未受影响）

## 7. 实现顺序（供实现计划参考）

1. **shared 类型**：`types/knowledge-base.ts` + `workflow.ts` 加 `'knowledge-base'` property type
2. **后端基础**：抽离 `embedding-util.ts`（并改造 `database-vector.ts` 引用）→ `knowledge-base-parser.ts` → `knowledge-base-store.ts`
3. **后端服务+路由**：`knowledge-base.ts` → `routes/knowledge-base.ts`（注册到 app）
4. **后端执行**：`execution-kb-nodes.ts` + `execution-manager.ts` 加 3 case
5. **SDK**：`modules/knowledge-base.ts` + 注册
6. **前端节点**：`definitions/knowledge-base.ts` + `index.ts` + `workflow-fields-knowledge-base.tsx`（新建 KnowledgeBasePicker）+ `workflow-fields-property.tsx` 加 `case 'knowledge-base'`（知识库选择器走专属 picker，**无需** dynamic options）
7. **前端对话框**：list → settings → detail（依赖 list 的 pick 模式）
8. **i18n**：`knowledgeBase.json` + 扩展 `nodes.json`
9. **测试 + 验收**

## 8. 非目标（YAGNI）

- pdf / docx / pptx / xlsx 解析（首版不支持，留扩展点）
- 重新嵌入整个知识库（仅单文件 reindex）
- 知识库权限/分享
- 向量数据库（使用 SQLite + 内存 cosine，与现有文档数据库一致）
- 独立的 `stores/knowledge-base.ts` Zustand store（初版对话框自管 state）
