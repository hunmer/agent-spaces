# 向量知识库子系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建一个独立的、文件导向的向量知识库子系统（KB → 文件 → 分块 → 向量），含 3 个工作流节点（`kb_add`/`kb_query`/`kb_delete`）+ 列表/详情/设置三对话框 + 后端存储/服务/路由/SDK，并抽离共享 embedding util。

**Architecture:** 后端用 `node:sqlite`（DatabaseSync）三表（`kbs`/`kb_files`/`kb_chunks`）持久化，文件本体存文件系统；嵌入逻辑从 `database-vector.ts` 抽离为 `embedding-util.ts` 共享；工作流节点在 `execution-manager.ts` 的 `dispatchNode` switch 加 case；前端仿 sqlite 子系统（专属 `type:'knowledge-base'` picker + 列表/详情/设置对话框）。

**Tech Stack:** TypeScript (strict, ESM, `.js` 后缀导入) · Express 5 + `node:sqlite` · Next.js 16 + Zustand + shadcn/ui + Tailwind · next-intl · `@xyflow/react` workflow · 仿 `node:sqlite` / `better-sqlite3` 风格的 DatabaseSync

**分支：** `feature/vector-knowledge-base`（已创建并提交设计文档）

**设计文档：** [docs/superpowers/specs/2026-06-16-vector-knowledge-base-design.md](../specs/2026-06-16-vector-knowledge-base-design.md)

---

## 重要约定（实现前必读）

1. **无测试框架**：本项目 server/web 无自动化测试（见 `claude/testing-and-quality.md`）。本计划**不引入** vitest/jest（YAGNI）。每个任务的"验证"步骤统一用：
   - `pnpm build`（类型检查，间接验证 shared/sdk/server/web 类型一致性）
   - `pnpm lint`（web）/ server 无 lint 则跳过
   - 纯函数（parser）用一次性 `node --input-type=module -e` 验证
   - API 端点用手动 curl 或工作流节点验证
2. **存储层细化**：设计文档第 2.1 节说"KB/File 用 JSON"——实现时发现 [database-store.ts](packages/server/src/storage/database-store.ts) 实际是**纯 SQLite**（`databases`/`doc_nodes`/`database_embeddings` 三表 + `node:sqlite` DatabaseSync + 连接池）。本计划对齐之，知识库用 **SQLite 三表**（`kbs`/`kb_files`/`kb_chunks`），文件本体（二进制）存文件系统目录 `~/.agent-spaces-data/knowledge-bases/<kbId>/files/<fileId>.<ext>`。
3. **ESM 导入**：所有相对导入带 `.js` 后缀（如 `'./embedding-util.js'`）。
4. **每个任务结束提交**：commit 信息中文，结尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`。
5. **构建顺序**：shared → sdk → server → web。改 shared 后需 `pnpm build`（或 dev 的 watch）让下游看到新类型。
6. **workspaceId 来源**：
   - 后端执行节点：从 `execution-manager` 的 `session` 取（执行者需读 `ExecutionSession` 类型 + `getRuntimeContext` 确认字段，最可能是 `session.workflow.workspaceId`）。
   - 前端：用 `workspaceIdFromLocation(pathname, search)`（[lib/routes.ts](packages/web/src/lib/routes.ts)），不是 store。

---

## 文件结构总览

### 新建文件
| 文件 | 职责 |
|------|------|
| `packages/shared/src/types/knowledge-base.ts` | KB/KbFile/KbChunk 类型 + 状态枚举 + 路由 DTO |
| `packages/server/src/services/embedding-util.ts` | 共享嵌入 util（从 database-vector 抽离） |
| `packages/server/src/services/knowledge-base-parser.ts` | 文件解析 + 分块 |
| `packages/server/src/storage/knowledge-base-store.ts` | SQLite 三表 CRUD |
| `packages/server/src/services/knowledge-base.ts` | 业务核心（加文件/查询/删除/重试） |
| `packages/server/src/routes/knowledge-base.ts` | REST 路由 |
| `packages/server/src/services/execution-kb-nodes.ts` | 3 个工作流节点执行函数 |
| `packages/sdk/src/modules/knowledge-base.ts` | SDK 模块 |
| `packages/web/src/lib/workflow-nodes/definitions/knowledge-base.ts` | 3 节点定义 |
| `packages/web/src/components/workflow/workflow-fields-knowledge-base.tsx` | KnowledgeBasePicker |
| `packages/web/src/components/workflow/knowledge-base-list-dialog.tsx` | 列表对话框 |
| `packages/web/src/components/workflow/knowledge-base-settings-dialog.tsx` | 设置对话框 |
| `packages/web/src/components/workflow/knowledge-base-detail-dialog.tsx` | 详情对话框 |
| `packages/web/src/locales/{en,zh}/knowledgeBase.json` | 对话框 i18n |

### 修改文件
| 文件 | 改动 |
|------|------|
| `packages/shared/src/types/index.ts` | 导出 knowledge-base 类型 |
| `packages/shared/src/types/workflow.ts` | `NodeProperty.type` 联合加 `'knowledge-base'` |
| `packages/server/src/services/database-vector.ts` | 改为引用 `embedding-util.js` |
| `packages/server/src/app.ts` | 挂载 knowledge-base 路由 |
| `packages/server/src/services/execution-manager.ts` | `dispatchNode` 加 3 个 case |
| `packages/sdk/src/index.ts` | 注册 `knowledgeBase` 模块 |
| `packages/web/src/lib/workflow-nodes/definitions/index.ts` | 导出 `knowledgeBaseNodes` |
| `packages/web/src/lib/workflow-nodes/registry.ts` | 聚合到 `allNodeDefinitions` |
| `packages/web/src/components/workflow/workflow-fields-property.tsx` | `case 'knowledge-base'` |
| `packages/web/src/locales/{en,zh}/index.ts` | 注册 knowledgeBase 命名空间 |
| nodes 命名空间 i18n 文件（执行时 grep `sqlite_query` 定位） | 加 categories.knowledgeBase + kb_* |

---

## Phase 1: shared 类型

### Task 1.1: 知识库类型定义

**Files:**
- Create: `packages/shared/src/types/knowledge-base.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: 创建类型文件**

创建 `packages/shared/src/types/knowledge-base.ts`：

```typescript
export type KbFileSourceType = 'upload' | 'path' | 'url';
export type KbFileIndexStatus = 'pending' | 'indexing' | 'indexed' | 'failed';

export interface KnowledgeBase {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  embeddingModelId: string | null;
  chunkSize: number;
  chunkOverlap: number;
  createdAt: number;
  updatedAt: number;
}

export interface KbFile {
  id: string;
  kbId: string;
  fileName: string;
  mimeType: string;
  size: number;
  sourceType: KbFileSourceType;
  sourceRef: string;
  storagePath: string;
  extractedText: string;
  chunkCount: number;
  indexStatus: KbFileIndexStatus;
  indexError: string | null;
  indexedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface KbChunk {
  chunkId: string;
  kbId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
  contentHash: string;
  modelId: string;
  createdAt: number;
}

export interface KnowledgeBaseStats {
  kbId: string;
  fileCount: number;
  indexedCount: number;
  pendingCount: number;
  failedCount: number;
  chunkCount: number;
}

export interface KbQueryMatch {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  chunkText: string;
  score: number;
}

export interface KbQueryResult {
  matches: KbQueryMatch[];
  count: number;
}

export interface KbAddFileBody {
  sourceType: 'path' | 'url';
  sourceRef: string;
  fileName?: string;
}
```

- [ ] **Step 2: 在 shared 类型聚合导出**

修改 `packages/shared/src/types/index.ts`，在 database 导出附近添加：

```typescript
export * from './knowledge-base.js';
```

- [ ] **Step 3: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: shared 构建成功，新类型可被下游导入。

- [ ] **Step 4: 提交**

```bash
git add packages/shared/src/types/knowledge-base.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add knowledge base types"
```

### Task 1.2: 扩展 NodeProperty type 联合

**Files:**
- Modify: `packages/shared/src/types/workflow.ts` (NodeProperty.type 联合，约 207 行)

- [ ] **Step 1: 加 'knowledge-base' 到 type 联合**

找到 `NodeProperty` 接口的 `type` 字段（约第 207 行）：

```typescript
type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions' | 'array' | 'output_fields' | 'agent' | 'sqlite';
```

改为（末尾加 `| 'knowledge-base'`）：

```typescript
type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions' | 'array' | 'output_fields' | 'agent' | 'sqlite' | 'knowledge-base';
```

- [ ] **Step 2: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add packages/shared/src/types/workflow.ts
git commit -m "feat(shared): add 'knowledge-base' to NodeProperty type union"
```

---

## Phase 2: 共享 embedding util 抽离

### Task 2.1: 创建 embedding-util.ts 并改造 database-vector.ts

**Files:**
- Create: `packages/server/src/services/embedding-util.ts`
- Modify: `packages/server/src/services/database-vector.ts`

- [ ] **Step 1: 创建 embedding-util.ts**

创建 `packages/server/src/services/embedding-util.ts`，把 `database-vector.ts` 中的纯函数迁移过来（`requireEmbeddingModelConfig`/`embedTexts`/`cosineSimilarity`/`getEmbeddingsUrl`/`hashText`/`isRecord`/`previewEmbeddingResponse`/`DatabaseVectorError`/`DatabaseVectorDebug`/常量）：

```typescript
import { createHash } from 'node:crypto';
import type { LLMModel, LLMProvider } from '@agent-spaces/shared';
import * as llmStore from '../storage/llm-store.js';

export const INDEX_BATCH_SIZE = 16;
export const MAX_INDEX_TEXT_LENGTH = 24_000;

export interface EmbeddingDebug {
  stage: string;
  providerName?: string;
  modelId?: string;
  requestUrl?: string;
  inputCount?: number;
  inputLengths?: number[];
  status?: number;
  responseContentType?: string | null;
  responseDataCount?: number;
  validEmbeddingCount?: number;
  embeddingDimensions?: number[];
  responseKeys?: string[];
  responsePreview?: unknown;
  batchStart?: number;
  batchSize?: number;
  indexedCount?: number;
}

export class EmbeddingError extends Error {
  debug: EmbeddingDebug;
  constructor(message: string, debug: EmbeddingDebug) {
    super(message);
    this.name = 'EmbeddingError';
    this.debug = debug;
  }
}

export interface EmbeddingModelConfig {
  model: LLMModel;
  provider: LLMProvider;
}

export function requireEmbeddingModelConfig(modelId: string): EmbeddingModelConfig {
  const model = llmStore.getModel(modelId);
  if (!model) throw new Error(`Embedding model not found: ${modelId}`);
  if (!model.embedding) throw new Error(`Selected model is not marked as an embedding model: ${model.name}`);
  const provider = llmStore.listProviders().find((item) => item.name === model.provider);
  if (!provider) throw new Error(`Provider not found for embedding model: ${model.provider}`);
  if (!provider.apiBase || !provider.apiKey || !model.modelId) {
    throw new Error(`Embedding provider is missing apiBase, apiKey, or modelId: ${provider.name}`);
  }
  return { model, provider };
}

export function getEmbeddingsUrl(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, '');
  if (base.endsWith('/embeddings')) return base;
  return `${base}/embeddings`;
}

export async function embedTexts(
  config: EmbeddingModelConfig,
  input: string[],
  extraDebug: Partial<EmbeddingDebug> = {},
): Promise<number[][]> {
  const requestUrl = getEmbeddingsUrl(config.provider.apiBase);
  const requestDebug: EmbeddingDebug = {
    stage: 'embedding_request',
    providerName: config.provider.name,
    modelId: config.model.modelId,
    requestUrl,
    inputCount: input.length,
    inputLengths: input.map((item) => item.length),
    ...extraDebug,
  };
  console.info('[embedding:embed] request', requestDebug);

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.model.modelId, input }),
  });

  const responseText = await response.text();
  const responseDebugBase: EmbeddingDebug = {
    ...requestDebug,
    stage: 'embedding_response',
    status: response.status,
    responseContentType: response.headers.get('content-type'),
  };

  if (!response.ok) {
    const debug = { ...responseDebugBase, responsePreview: responseText.slice(0, 1000) };
    console.warn('[embedding:embed] failed response', debug);
    throw new EmbeddingError(`Embedding request failed with status ${response.status}`, debug);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    const debug = { ...responseDebugBase, stage: 'embedding_parse_json', responsePreview: responseText.slice(0, 1000) };
    console.warn('[embedding:embed] invalid json', debug);
    throw new EmbeddingError('Embedding response is not valid JSON.', debug);
  }

  const responseData = isRecord(data) && Array.isArray(data.data) ? data.data : undefined;
  const embeddings = responseData
    ?.map((item) => (isRecord(item) ? item.embedding : undefined))
    .filter((item): item is number[] => Array.isArray(item) && item.every((value) => typeof value === 'number'));
  const debug: EmbeddingDebug = {
    ...responseDebugBase,
    responseDataCount: responseData?.length,
    validEmbeddingCount: embeddings?.length ?? 0,
    embeddingDimensions: embeddings?.map((e) => e.length).slice(0, 10),
    responseKeys: isRecord(data) ? Object.keys(data) : undefined,
    responsePreview: previewEmbeddingResponse(data),
  };
  console.info('[embedding:embed] parsed response', debug);

  if (!embeddings || embeddings.length !== input.length) {
    throw new EmbeddingError(
      `Embedding response does not match input length. expected=${input.length}, data=${responseData?.length ?? 0}, validEmbeddings=${embeddings?.length ?? 0}`,
      debug,
    );
  }
  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let ma = 0;
  let mb = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    ma += a[index] * a[index];
    mb += b[index] * b[index];
  }
  if (!ma || !mb) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function normalizeIndexText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_INDEX_TEXT_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function previewEmbeddingResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const data = Array.isArray(value.data)
    ? value.data.slice(0, 3).map((item) => {
        if (!isRecord(item)) return item;
        const embedding = Array.isArray(item.embedding) ? item.embedding : undefined;
        return { ...item, embedding: embedding ? `[number[${embedding.length}]]` : item.embedding };
      })
    : value.data;
  return { ...value, data };
}
```

- [ ] **Step 2: 改造 database-vector.ts 引用 util**

修改 `packages/server/src/services/database-vector.ts`：
- 删除被迁移的函数体（`requireEmbeddingModelConfig`/`embedTexts`/`cosineSimilarity`/`getEmbeddingsUrl`/`hashText`/`normalizeIndexText`/`isRecord`/`previewEmbeddingResponse`/`DatabaseVectorError`/`DatabaseVectorDebug`/`INDEX_BATCH_SIZE`/`MAX_INDEX_TEXT_LENGTH`）。
- 顶部改为从 util 导入：

```typescript
import { createHash } from 'node:crypto';
import type { DatabaseVectorIndexResult, DatabaseVectorSearchResult } from '@agent-spaces/shared';
import * as databaseStore from '../storage/database-store.js';
import {
  INDEX_BATCH_SIZE,
  MAX_INDEX_TEXT_LENGTH,
  EmbeddingError,
  embedTexts,
  cosineSimilarity,
  hashText,
  normalizeIndexText,
  requireEmbeddingModelConfig,
  type EmbeddingDebug,
} from './embedding-util.js';

// 向后兼容别名：database-vector 原先导出 DatabaseVectorError / DatabaseVectorDebug
export const DatabaseVectorError = EmbeddingError;
export type DatabaseVectorDebug = EmbeddingDebug;
```

- 保留 `indexDatabaseVectors` / `searchDatabaseVectors` / `buildDatabaseNodePath` / `stripHtml` 函数体不变（它们调用 util 的函数，签名一致）。
- 删除文件内重复的 `requireEmbeddingModelConfig` 里的 `import * as llmStore`（已在 util 里）。`indexDatabaseVectors` 中 `hashText(item.text)` 保留。

- [ ] **Step 3: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: server 构建成功；`database-vector.ts` 仍导出 `indexDatabaseVectors`/`searchDatabaseVectors`/`DatabaseVectorError`/`DatabaseVectorDebug`（向后兼容，routes/database.ts 不受影响）。

- [ ] **Step 4: 提交**

```bash
git add packages/server/src/services/embedding-util.ts packages/server/src/services/database-vector.ts
git commit -m "refactor(server): extract shared embedding util from database-vector"
```

---

## Phase 3: 文件解析 + 分块

### Task 3.1: knowledge-base-parser.ts

**Files:**
- Create: `packages/server/src/services/knowledge-base-parser.ts`

- [ ] **Step 1: 创建解析器**

创建 `packages/server/src/services/knowledge-base-parser.ts`：

```typescript
import { readFileSync } from 'node:fs';

export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.html', '.htm',
  '.json', '.log', '.xml', '.yaml', '.yml',
]);

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/javascript'];

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i).toLowerCase() : '';
}

/** 首版仅支持文本类文件；二进制(pdf/docx/...)抛 UnsupportedFormatError。留扩展点。 */
export function extractText(filePath: string, mimeType: string, fileName: string): string {
  const ext = extOf(fileName);
  const isTextByExt = TEXT_EXTENSIONS.has(ext);
  const isTextByMime = TEXT_MIME_PREFIXES.some((p) => mimeType.toLowerCase().startsWith(p));
  if (!isTextByExt && !isTextByMime) {
    throw new UnsupportedFormatError(`暂不支持该格式解析: ${ext || mimeType || '未知'}`);
  }
  return readFileSync(filePath, 'utf8');
}

/** 字符滑窗分块。size=块大小, overlap=重叠。步长 = max(1, size - overlap)。 */
export function chunkText(text: string, size: number, overlap: number): string[] {
  const s = Math.max(1, Math.floor(size));
  const o = Math.max(0, Math.min(Math.floor(overlap), s - 1));
  const step = Math.max(1, s - o);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + s));
    if (i + s >= text.length) break;
  }
  return chunks.length ? chunks : [''];
}
```

- [ ] **Step 2: 一次性验证纯函数**

Run（在仓库根）:
```bash
cd g:/agent_spaces/packages/server && node --input-type=module -e "
import { chunkText } from './src/services/knowledge-base-parser.js';
const t = '0123456789'.repeat(3);
console.log(JSON.stringify(chunkText(t, 5, 2)));
"
```
Expected: 输出按 5 字符、overlap 2 切分的块数组（约 5 块），验证滑窗正确。

- [ ] **Step 3: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: 成功。

- [ ] **Step 4: 提交**

```bash
git add packages/server/src/services/knowledge-base-parser.ts
git commit -m "feat(server): add knowledge base text parser and chunker"
```

---

## Phase 4: 存储层

### Task 4.1: knowledge-base-store.ts（SQLite 三表）

**Files:**
- Create: `packages/server/src/storage/knowledge-base-store.ts`

参考 [database-store.ts](packages/server/src/storage/database-store.ts) 的 `node:sqlite` DatabaseSync + 连接池 + `getDataDir`/`ensureDir` 模式。

- [ ] **Step 1: 创建存储层**

创建 `packages/server/src/storage/knowledge-base-store.ts`：

```typescript
import { join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { v4 as uuid } from 'uuid';
import { getDataDir, ensureDir } from './json-store.js';
import type {
  KnowledgeBase, KbFile, KbChunk, KnowledgeBaseStats,
  KbFileIndexStatus, KbFileSourceType,
} from '@agent-spaces/shared';

const POOL: DatabaseSync[] = [];
let DB: DatabaseSync | null = null;

function dbFile(): string {
  const dir = join(getDataDir(), 'knowledge-bases');
  ensureDir(dir);
  return join(dir, 'knowledge-bases.sqlite');
}

function openDb(): DatabaseSync {
  if (DB) return DB;
  const db = new DatabaseSync(dbFile());
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kbs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      embedding_model_id TEXT,
      chunk_size INTEGER NOT NULL DEFAULT 1000,
      chunk_overlap INTEGER NOT NULL DEFAULT 200,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_files (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL DEFAULT 'upload',
      source_ref TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      extracted_text TEXT NOT NULL DEFAULT '',
      chunk_count INTEGER NOT NULL DEFAULT 0,
      index_status TEXT NOT NULL DEFAULT 'pending',
      index_error TEXT,
      indexed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_files_kb ON kb_files(kb_id);
    CREATE TABLE IF NOT EXISTS kb_chunks (
      chunk_id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      content_hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      model_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks(file_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb ON kb_chunks(kb_id);
  `);
  DB = db;
  return db;
}

function kbDir(kbId: string): string {
  return join(getDataDir(), 'knowledge-bases', kbId);
}
export function ensureKbDir(kbId: string): string {
  const dir = join(kbDir(kbId), 'files');
  ensureDir(dir);
  return dir;
}
export function removeKbDir(kbId: string): void {
  const dir = kbDir(kbId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

const now = () => Date.now();

function mapKb(r: Record<string, unknown>): KnowledgeBase {
  return {
    id: r.id as string, workspaceId: r.workspace_id as string,
    name: r.name as string, description: r.description as string,
    embeddingModelId: (r.embedding_model_id as string) ?? null,
    chunkSize: r.chunk_size as number, chunkOverlap: r.chunk_overlap as number,
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}
function mapFile(r: Record<string, unknown>): KbFile {
  return {
    id: r.id as string, kbId: r.kb_id as string,
    fileName: r.file_name as string, mimeType: r.mime_type as string,
    size: r.size as number, sourceType: r.source_type as KbFileSourceType,
    sourceRef: r.source_ref as string, storagePath: r.storage_path as string,
    extractedText: r.extracted_text as string, chunkCount: r.chunk_count as number,
    indexStatus: r.index_status as KbFileIndexStatus, indexError: (r.index_error as string) ?? null,
    indexedAt: (r.indexed_at as number) ?? null,
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}

// ---- KB CRUD ----
export function createKb(workspaceId: string, data: { name: string; description?: string; chunkSize?: number; chunkOverlap?: number }): KnowledgeBase {
  const db = openDb();
  const ts = now();
  const kb: KnowledgeBase = {
    id: uuid(), workspaceId, name: data.name, description: data.description ?? '',
    embeddingModelId: null, chunkSize: data.chunkSize ?? 1000, chunkOverlap: data.chunkOverlap ?? 200,
    createdAt: ts, updatedAt: ts,
  };
  db.prepare(`INSERT INTO kbs (id, workspace_id, name, description, embedding_model_id, chunk_size, chunk_overlap, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`).run(kb.id, kb.workspaceId, kb.name, kb.description, kb.chunkSize, kb.chunkOverlap, ts, ts);
  ensureKbDir(kb.id);
  return kb;
}

export function getKb(workspaceId: string, kbId: string): KnowledgeBase | null {
  const r = openDb().prepare('SELECT * FROM kbs WHERE id = ? AND workspace_id = ?').get(kbId, workspaceId);
  return r ? mapKb(r as Record<string, unknown>) : null;
}

export function listKbs(workspaceId: string): KnowledgeBase[] {
  const rows = openDb().prepare('SELECT * FROM kbs WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  return rows.map(mapKb);
}

export function updateKb(workspaceId: string, kbId: string, patch: Partial<Pick<KnowledgeBase, 'name' | 'description' | 'embeddingModelId' | 'chunkSize' | 'chunkOverlap'>>): void {
  const cur = getKb(workspaceId, kbId);
  if (!cur) throw new Error(`Knowledge base not found: ${kbId}`);
  const next = { ...cur, ...patch, updatedAt: now() };
  openDb().prepare(`UPDATE kbs SET name=?, description=?, embedding_model_id=?, chunk_size=?, chunk_overlap=?, updated_at=? WHERE id=? AND workspace_id=?`)
    .run(next.name, next.description, next.embeddingModelId, next.chunkSize, next.chunkOverlap, next.updatedAt, kbId, workspaceId);
}

export function deleteKb(workspaceId: string, kbId: string): void {
  const db = openDb();
  db.prepare('DELETE FROM kb_chunks WHERE kb_id = ?').run(kbId);
  db.prepare('DELETE FROM kb_files WHERE kb_id = ?').run(kbId);
  db.prepare('DELETE FROM kbs WHERE id = ? AND workspace_id = ?').run(kbId, workspaceId);
  removeKbDir(kbId);
}

// ---- KbFile CRUD ----
export function addFile(file: Omit<KbFile, 'createdAt' | 'updatedAt'>): KbFile {
  const ts = now();
  const rec: KbFile = { ...file, createdAt: ts, updatedAt: ts };
  openDb().prepare(`INSERT INTO kb_files (id, kb_id, file_name, mime_type, size, source_type, source_ref, storage_path, extracted_text, chunk_count, index_status, index_error, indexed_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    rec.id, rec.kbId, rec.fileName, rec.mimeType, rec.size, rec.sourceType, rec.sourceRef,
    rec.storagePath, rec.extractedText, rec.chunkCount, rec.indexStatus, rec.indexError, rec.indexedAt, ts, ts,
  );
  return rec;
}

export function getFile(workspaceId: string, kbId: string, fileId: string): KbFile | null {
  const r = openDb().prepare('SELECT * FROM kb_files WHERE id = ? AND kb_id = ?').get(fileId, kbId) as Record<string, unknown> | undefined;
  // 校验归属：kb 必须属于 workspace
  if (r && !getKb(workspaceId, kbId)) return null;
  return r ? mapFile(r) : null;
}

export function listFiles(workspaceId: string, kbId: string): KbFile[] {
  if (!getKb(workspaceId, kbId)) return [];
  const rows = openDb().prepare('SELECT * FROM kb_files WHERE kb_id = ? ORDER BY created_at DESC').all(kbId) as Record<string, unknown>[];
  return rows.map(mapFile);
}

export function updateFileStatus(kbId: string, fileId: string, patch: Partial<Pick<KbFile, 'indexStatus' | 'indexError' | 'indexedAt' | 'chunkCount' | 'extractedText'>>): void {
  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now()];
  if (patch.indexStatus !== undefined) { sets.push('index_status = ?'); params.push(patch.indexStatus); }
  if (patch.indexError !== undefined) { sets.push('index_error = ?'); params.push(patch.indexError); }
  if (patch.indexedAt !== undefined) { sets.push('indexed_at = ?'); params.push(patch.indexedAt); }
  if (patch.chunkCount !== undefined) { sets.push('chunk_count = ?'); params.push(patch.chunkCount); }
  if (patch.extractedText !== undefined) { sets.push('extracted_text = ?'); params.push(patch.extractedText); }
  openDb().prepare(`UPDATE kb_files SET ${sets.join(', ')} WHERE id = ? AND kb_id = ?`).run(...params, fileId, kbId);
}

export function deleteFile(kbId: string, fileId: string): void {
  const db = openDb();
  db.prepare('DELETE FROM kb_chunks WHERE file_id = ?').run(fileId);
  db.prepare('DELETE FROM kb_files WHERE id = ? AND kb_id = ?').run(fileId, kbId);
}

// ---- KbChunk + Embedding ----
export function deleteFileChunks(kbId: string, fileId: string): void {
  openDb().prepare('DELETE FROM kb_chunks WHERE kb_id = ? AND file_id = ?').run(kbId, fileId);
}

export function upsertChunk(chunk: Omit<KbChunk, 'createdAt'> & { embedding: number[] }): void {
  const db = openDb();
  db.prepare(`INSERT INTO kb_chunks (chunk_id, kb_id, file_id, chunk_index, text, content_hash, embedding, model_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chunk_id) DO UPDATE SET text=excluded.text, content_hash=excluded.content_hash, embedding=excluded.embedding, model_id=excluded.model_id`)
    .run(chunk.chunkId, chunk.kbId, chunk.fileId, chunk.chunkIndex, chunk.text, chunk.contentHash, JSON.stringify(chunk.embedding), chunk.modelId, now());
}

export function listChunkVectors(kbId: string, fileId?: string): Array<{ chunk: KbChunk; embedding: number[]; fileName: string }> {
  const db = openDb();
  const rows = fileId
    ? db.prepare('SELECT c.*, f.file_name FROM kb_chunks c JOIN kb_files f ON f.id = c.file_id WHERE c.kb_id = ? AND c.file_id = ?').all(kbId, fileId)
    : db.prepare('SELECT c.*, f.file_name FROM kb_chunks c JOIN kb_files f ON f.id = c.file_id WHERE c.kb_id = ?').all(kbId);
  return (rows as Record<string, unknown>[]).map((r) => ({
    chunk: {
      chunkId: r.chunk_id as string, kbId: r.kb_id as string, fileId: r.file_id as string,
      chunkIndex: r.chunk_index as number, text: r.text as string, contentHash: r.content_hash as string,
      modelId: r.model_id as string, createdAt: r.created_at as number,
    },
    embedding: JSON.parse(r.embedding as string) as number[],
    fileName: r.file_name as string,
  }));
}

export function getKbStats(workspaceId: string, kbId: string): KnowledgeBaseStats {
  if (!getKb(workspaceId, kbId)) throw new Error(`Knowledge base not found: ${kbId}`);
  const db = openDb();
  const files = db.prepare('SELECT index_status, COUNT(*) AS n FROM kb_files WHERE kb_id = ? GROUP BY index_status').all(kbId) as Array<{ index_status: string; n: number }>;
  const chunkCount = (db.prepare('SELECT COUNT(*) AS n FROM kb_chunks WHERE kb_id = ?').get(kbId) as { n: number }).n;
  let indexedCount = 0, pendingCount = 0, failedCount = 0, fileCount = 0;
  for (const r of files) {
    fileCount += r.n;
    if (r.index_status === 'indexed') indexedCount += r.n;
    else if (r.index_status === 'pending' || r.index_status === 'indexing') pendingCount += r.n;
    else if (r.index_status === 'failed') failedCount += r.n;
  }
  return { kbId, fileCount, indexedCount, pendingCount, failedCount, chunkCount };
}

export function listAllKbFileIds(kbId: string): string[] {
  const rows = openDb().prepare('SELECT id FROM kb_files WHERE kb_id = ?').all(kbId) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}
```

> 注：`readdirSync` 导入未使用可移除；保留 `existsSync/mkdirSync/rmSync`。`POOL` 数组当前未用（单 DB 实例足够），可删；保持简单。

- [ ] **Step 2: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: server 构建成功。

- [ ] **Step 3: 提交**

```bash
git add packages/server/src/storage/knowledge-base-store.ts
git commit -m "feat(server): add knowledge base SQLite store"
```

---

## Phase 5: 业务服务层

### Task 5.1: knowledge-base.ts 服务核心

**Files:**
- Create: `packages/server/src/services/knowledge-base.ts`

- [ ] **Step 1: 创建服务**

创建 `packages/server/src/services/knowledge-base.ts`：

```typescript
import { join, extname } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import * as kbStore from '../storage/knowledge-base-store.js';
import { extractText, chunkText, UnsupportedFormatError } from './knowledge-base-parser.js';
import {
  INDEX_BATCH_SIZE, embedTexts, cosineSimilarity, hashText,
  normalizeIndexText, requireEmbeddingModelConfig,
} from './embedding-util.js';
import type {
  KnowledgeBase, KbFile, KnowledgeBaseStats, KbQueryResult, KbQueryMatch,
  KbAddFileBody,
} from '@agent-spaces/shared';

function guessMime(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown',
    '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.html': 'text/html', '.htm': 'text/html',
    '.json': 'application/json', '.log': 'text/plain', '.xml': 'application/xml',
    '.yaml': 'application/x-yaml', '.yml': 'application/x-yaml',
  };
  return map[ext] ?? 'application/octet-stream';
}

function storageFileName(kbId: string, fileId: string, fileName: string): { dir: string; path: string } {
  const dir = kbStore.ensureKbDir(kbId);
  const ext = extname(fileName) || '';
  return { dir, path: join(dir, `${fileId}${ext}`) };
}

/** 核心加入+索引。失败时写入 failed 状态并返回（不抛出），调用方据 indexStatus 判断。 */
export async function addFileToKnowledgeBase(
  workspaceId: string,
  kbId: string,
  input: { sourceType: 'upload' | 'path' | 'url'; sourceRef: string; fileName: string; buffer?: Buffer },
): Promise<KbFile> {
  const kb = kbStore.getKb(workspaceId, kbId);
  if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);

  // 1. 取文件 buffer
  let buffer: Buffer;
  if (input.sourceType === 'upload' && input.buffer) {
    buffer = input.buffer;
  } else if (input.sourceType === 'path') {
    buffer = readFileSync(input.sourceRef); // 调用方负责 safeSrcPath 校验
  } else {
    const resp = await fetch(input.sourceRef);
    if (!resp.ok) throw new Error(`下载失败 ${resp.status}: ${input.sourceRef}`);
    buffer = Buffer.from(await resp.arrayBuffer());
  }

  const fileId = cryptoRandom();
  const { path: storagePath } = storageFileName(kbId, fileId, input.fileName);
  writeFileSync(storagePath, buffer);

  const file = kbStore.addFile({
    id: fileId, kbId, fileName: input.fileName, mimeType: guessMime(input.fileName),
    size: buffer.length, sourceType: input.sourceType, sourceRef: input.sourceRef,
    storagePath, extractedText: '', chunkCount: 0,
    indexStatus: 'pending', indexError: null, indexedAt: null,
  });

  // 2-6. 解析+分块+嵌入（失败吞没，写 failed）
  await indexFile(workspaceId, kb, file).catch(() => { /* 状态已在 indexFile 内写 failed */ });
  return kbStore.getFile(workspaceId, kbId, fileId)!;
}

async function indexFile(workspaceId: string, kb: KnowledgeBase, file: KbFile): Promise<void> {
  kbStore.updateFileStatus(kb.id, file.id, { indexStatus: 'indexing', indexError: null });
  try {
    if (!kb.embeddingModelId) throw new Error('未绑定 embedding 模型');
    const config = requireEmbeddingModelConfig(kb.embeddingModelId);
    const text = extractText(file.storagePath, file.mimeType, file.fileName);
    const clean = normalizeIndexText(text);
    kbStore.updateFileStatus(kb.id, file.id, { extractedText: clean });
    const chunks = chunkText(clean, kb.chunkSize, kb.chunkOverlap);
    kbStore.deleteFileChunks(kb.id, file.id);
    for (let i = 0; i < chunks.length; i += INDEX_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INDEX_BATCH_SIZE);
      const embeddings = await embedTexts(config, batch.map((c) => normalizeIndexText(c)));
      embeddings.forEach((embedding, offset) => {
        const chunkTextItem = batch[offset];
        kbStore.upsertChunk({
          chunkId: `${file.id}_${i + offset}`, kbId: kb.id, fileId: file.id,
          chunkIndex: i + offset, text: chunkTextItem, contentHash: hashText(chunkTextItem),
          embedding, modelId: config.model.modelId,
        });
      });
    }
    kbStore.updateFileStatus(kb.id, file.id, { indexStatus: 'indexed', indexedAt: Date.now(), chunkCount: chunks.length });
  } catch (e) {
    const msg = e instanceof UnsupportedFormatError ? e.message : (e instanceof Error ? e.message : String(e));
    kbStore.updateFileStatus(kb.id, file.id, { indexStatus: 'failed', indexError: msg });
    throw e;
  }
}

export async function reindexFile(workspaceId: string, kbId: string, fileId: string): Promise<KbFile> {
  const kb = kbStore.getKb(workspaceId, kbId);
  const file = kbStore.getFile(workspaceId, kbId, fileId);
  if (!kb || !file) throw new Error('File not found');
  await indexFile(workspaceId, kb, file).catch(() => {});
  return kbStore.getFile(workspaceId, kbId, fileId)!;
}

export async function queryKnowledgeBase(workspaceId: string, kbId: string, query: string, topK = 5): Promise<KbQueryResult> {
  const kb = kbStore.getKb(workspaceId, kbId);
  if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);
  if (!kb.embeddingModelId) throw new Error('未绑定 embedding 模型');
  const cleanQuery = normalizeIndexText(query);
  if (!cleanQuery) throw new Error('query is required.');
  const config = requireEmbeddingModelConfig(kb.embeddingModelId);
  const [queryEmbedding] = await embedTexts(config, [cleanQuery]);
  const rows = kbStore.listChunkVectors(kbId);
  const matches: KbQueryMatch[] = rows
    .map((r) => ({
      fileId: r.chunk.fileId, fileName: r.fileName, chunkIndex: r.chunk.chunkIndex,
      chunkText: r.chunk.text, score: cosineSimilarity(queryEmbedding, r.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(topK, 20)));
  return { matches, count: matches.length };
}

export function deleteFileFromKb(workspaceId: string, kbId: string, fileId: string): { deletedChunks: number } {
  const file = kbStore.getFile(workspaceId, kbId, fileId);
  if (!file) throw new Error('File not found');
  kbStore.deleteFile(kbId, fileId); // 内部先删 chunks 再删 file
  return { deletedChunks: 0 };
}

export function getStats(workspaceId: string, kbId: string): KnowledgeBaseStats {
  return kbStore.getKbStats(workspaceId, kbId);
}

function cryptoRandom(): string {
  const { randomUUID } = require('node:crypto');
  return randomUUID();
}
```

> 注：`cryptoRandom` 用 `require` 是为避免顶部 `import` 循环疑虑；实现时统一改为顶部 `import { randomUUID } from 'node:crypto'` 并直接调用，删除该包装函数。store 已用 `uuid`，这里也可统一用 `uuid`——实现时统一为 `import { v4 as uuid } from 'uuid'` 生成 fileId，与 store 一致。

- [ ] **Step 2: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add packages/server/src/services/knowledge-base.ts
git commit -m "feat(server): add knowledge base service (add/query/delete/reindex)"
```

---

## Phase 6: 路由

### Task 6.1: routes/knowledge-base.ts + app.ts 挂载

**Files:**
- Create: `packages/server/src/routes/knowledge-base.ts`
- Modify: `packages/server/src/app.ts`

参考 [routes/database.ts](packages/server/src/routes/database.ts)：`Router({ mergeParams: true })` + `wid = req.params.id`。

- [ ] **Step 1: 创建路由**

创建 `packages/server/src/routes/knowledge-base.ts`：

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as store from '../storage/knowledge-base-store.js';
import * as kbService from '../services/knowledge-base.js';
import { safeSrcPath } from '../storage/json-store.js';

const router = Router({ mergeParams: true });
const wid = (req: Request): string => req.params.id as string;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  chunkSize: z.number().int().min(100).optional(),
  chunkOverlap: z.number().int().min(0).optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  embeddingModelId: z.string().nullable().optional(),
  chunkSize: z.number().int().min(100).optional(),
  chunkOverlap: z.number().int().min(0).optional(),
});
const addFileSchema = z.object({
  sourceType: z.enum(['path', 'url']),
  sourceRef: z.string().min(1),
  fileName: z.string().min(1),
});
const querySchema = z.object({ query: z.string().min(1), topK: z.number().int().min(1).max(20).optional() });
const bindModelSchema = z.object({ embeddingModelId: z.string().nullable() });

// KB CRUD
router.get('/knowledge-bases', (_req, res) => res.json(store.listKbs(wid(_req))));

router.post('/knowledge-bases', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  res.status(201).json(store.createKb(wid(req), parsed.data));
});

router.put('/knowledge-bases/:kbId', (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  if (!store.getKb(wid(req), req.params.kbId)) return res.status(404).json({ error: 'Not found' });
  store.updateKb(wid(req), req.params.kbId, parsed.data);
  res.json(store.getKb(wid(req), req.params.kbId));
});

router.delete('/knowledge-bases/:kbId', (req, res) => {
  if (!store.getKb(wid(req), req.params.kbId)) return res.status(404).json({ error: 'Not found' });
  store.deleteKb(wid(req), req.params.kbId);
  res.json({ ok: true });
});

router.get('/knowledge-bases/:kbId/stats', (req, res) => {
  try { res.json(kbService.getStats(wid(req), req.params.kbId)); }
  catch (e) { res.status(404).json({ error: (e as Error).message }); }
});

router.put('/knowledge-bases/:kbId/embedding-model', (req, res) => {
  const parsed = bindModelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  if (!store.getKb(wid(req), req.params.kbId)) return res.status(404).json({ error: 'Not found' });
  store.updateKb(wid(req), req.params.kbId, { embeddingModelId: parsed.data.embeddingModelId });
  res.json(store.getKb(wid(req), req.params.kbId));
});

// Files
router.get('/knowledge-bases/:kbId/files', (req, res) => res.json(store.listFiles(wid(req), req.params.kbId)));

router.post('/knowledge-bases/:kbId/files', async (req, res) => {
  const kbId = req.params.kbId;
  if (!store.getKb(wid(req), kbId)) return res.status(404).json({ error: 'Not found' });
  try {
    let file;
    const isMultipart = req.is('multipart/form-data');
    if (isMultipart) {
      // multer/express-fileupload 不可用——本项目用裸 express。此处用 raw body 兜底:
      // 详情对话框改用 JSON { sourceType:'path', sourceRef, fileName } 上传已落地的临时文件。
      // 若需 multipart,在 Phase 12 详情对话框里改为「先上传到 /api/workspaces/:id/files 再 path 加入」。
      return res.status(415).json({ error: '请使用 JSON body { sourceType, sourceRef, fileName }' });
    }
    const parsed = addFileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const safePath = parsed.data.sourceType === 'path' ? safeSrcPath(parsed.data.sourceRef) : parsed.data.sourceRef;
    file = await kbService.addFileToKnowledgeBase(wid(req), kbId, {
      sourceType: parsed.data.sourceType, sourceRef: safePath, fileName: parsed.data.fileName,
    });
    res.status(201).json(file);
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

router.get('/knowledge-bases/:kbId/files/:fileId', (req, res) => {
  const f = store.getFile(wid(req), req.params.kbId, req.params.fileId);
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(f);
});

router.delete('/knowledge-bases/:kbId/files/:fileId', (req, res) => {
  try { res.json(kbService.deleteFileFromKb(wid(req), req.params.kbId, req.params.fileId)); }
  catch (e) { res.status(404).json({ error: (e as Error).message }); }
});

router.post('/knowledge-bases/:kbId/files/:fileId/reindex', async (req, res) => {
  try { res.json(await kbService.reindexFile(wid(req), req.params.kbId, req.params.fileId)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

router.post('/knowledge-bases/:kbId/query', async (req, res) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try { res.json(await kbService.queryKnowledgeBase(wid(req), req.params.kbId, parsed.data.query, parsed.data.topK)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

export default router;
```

> **multipart 说明**：本项目 server 是裸 express（无 multer）。详情对话框的文件上传改为：**前端先调用现有文件上传能力落盘得到路径，再用 `{sourceType:'path', sourceRef, fileName}` 加入知识库**。执行者在 Phase 12 确认前端是否有通用文件上传端点（搜 `/api/.../files` 或 upload）；若无，详情对话框的"加入文件"先用一个 `<textarea>` 让用户粘贴文本 + 文件名，调一个临时 `sourceType:'upload'` 的 JSON 端点（本计划不展开，作为 Phase 12 的明确子任务）。

- [ ] **Step 2: 确认 safeSrcPath 是否导出**

执行者确认 `json-store.ts` 是否导出 `safeSrcPath`（搜 `export function safeSrcPath` 或 `export.*safeSrcPath`）。若不存在或签名不同（可能是 `safeSrcPath(base, rel)`），在路由内调整调用。若无路径校验工具，临时用 `resolve(getDataDir(), sourceRef)` + 起始目录包含校验，避免越界。

- [ ] **Step 3: 在 app.ts 挂载路由**

修改 `packages/server/src/app.ts`：
- 顶部 import 区（仿 databaseRouter import）加：
```typescript
import knowledgeBaseRouter from './routes/knowledge-base.js';
```
- 找到 databaseRouter 的 `app.use(...)` 挂载行（约第 300 行，`app.use('/api/workspaces/:id', databaseRouter)` 或类似），在其下方加：
```typescript
app.use('/api/workspaces/:id', knowledgeBaseRouter);
```
> 路由内部端点以 `/knowledge-bases` 开头，故挂载到 `/api/workspaces/:id` 后完整路径为 `/api/workspaces/:id/knowledge-bases...`，与 SDK 对齐。执行者核对 databaseRouter 实际挂载方式（mergeParams 取 `:id` 作为 workspaceId）。

- [ ] **Step 4: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: server 构建成功。

- [ ] **Step 5: 提交**

```bash
git add packages/server/src/routes/knowledge-base.ts packages/server/src/app.ts
git commit -m "feat(server): add knowledge base REST routes"
```

---

## Phase 7: 工作流节点执行

### Task 7.1: execution-kb-nodes.ts + execution-manager case

**Files:**
- Create: `packages/server/src/services/execution-kb-nodes.ts`
- Modify: `packages/server/src/services/execution-manager.ts` (`dispatchNode` switch，约 570 行)

- [ ] **Step 1: 先确认 workspaceId 来源**

执行者读 `execution-manager.ts` 的 `ExecutionSession` 类型 + `getRuntimeContext(session)` 返回结构，确认 `workspaceId` 字段路径（最可能 `session.workflow.workspaceId`）。记下确切字段。

- [ ] **Step 2: 创建执行函数**

创建 `packages/server/src/services/execution-kb-nodes.ts`：

```typescript
import * as kbService from '../services/knowledge-base.js';
import * as kbStore from '../storage/knowledge-base-store.js';

function parseIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function executeKbAdd(
  resolvedData: Record<string, any>,
  workspaceId: string,
): Promise<{ fileId: string; fileName: string; chunkCount: number; status: string }> {
  const kbId = String(resolvedData.knowledgeBase || '');
  const filePath = String(resolvedData.filePath || '');
  const fileName = String(resolvedData.fileName || filePath.split(/[\\/]/).pop() || 'file');
  if (!kbId) throw new Error('未选择知识库');
  if (!filePath) throw new Error('filePath 为空');
  const sourceType = /^https?:\/\//i.test(filePath) ? 'url' : 'path';
  const file = await kbService.addFileToKnowledgeBase(workspaceId, kbId, {
    sourceType, sourceRef: filePath, fileName,
  });
  return { fileId: file.id, fileName: file.fileName, chunkCount: file.chunkCount, status: file.indexStatus };
}

export async function executeKbQuery(
  resolvedData: Record<string, any>,
  workspaceId: string,
): Promise<{ matches: unknown[]; count: number }> {
  const kbId = String(resolvedData.knowledgeBase || '');
  const query = String(resolvedData.query || '');
  const topK = Number(resolvedData.topK) > 0 ? Number(resolvedData.topK) : 5;
  if (!kbId) throw new Error('未选择知识库');
  const result = await kbService.queryKnowledgeBase(workspaceId, kbId, query, topK);
  return { matches: result.matches, count: result.count };
}

export function executeKbDelete(
  resolvedData: Record<string, any>,
  workspaceId: string,
): { deletedCount: number } {
  const kbId = String(resolvedData.knowledgeBase || '');
  const ids = parseIds(resolvedData.fileId);
  if (!kbId) throw new Error('未选择知识库');
  let deletedCount = 0;
  for (const fileId of ids) {
    try { kbService.deleteFileFromKb(workspaceId, kbId, fileId); deletedCount++; } catch { /* 文件不存在则跳过 */ }
  }
  return { deletedCount };
}
```

- [ ] **Step 3: 在 dispatchNode 加 case**

修改 `packages/server/src/services/execution-manager.ts`：
- 顶部 import 区（仿 execution-sqlite-nodes import）加：
```typescript
import { executeKbAdd, executeKbQuery, executeKbDelete } from './execution-kb-nodes.js';
```
- 在 `dispatchNode` 的 switch（约 570 行），sqlite case 附近加（用 Step 1 确认的 workspaceId 字段，下面以 `session.workflow.workspaceId` 为例，执行者按实际替换）：
```typescript
case 'kb_add': {
  const wsId = session.workflow.workspaceId;
  return executeKbAdd(resolvedData, wsId);
}
case 'kb_query': {
  const wsId = session.workflow.workspaceId;
  return executeKbQuery(resolvedData, wsId);
}
case 'kb_delete': {
  const wsId = session.workflow.workspaceId;
  return executeKbDelete(resolvedData, wsId);
}
```

- [ ] **Step 4: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: 成功（确认 `session.workflow.workspaceId` 字段存在；若类型报错，按 Step 1 实际字段修正）。

- [ ] **Step 5: 提交**

```bash
git add packages/server/src/services/execution-kb-nodes.ts packages/server/src/services/execution-manager.ts
git commit -m "feat(server): add kb_add/kb_query/kb_delete workflow node executors"
```

---

## Phase 8: SDK 模块

### Task 8.1: sdk/modules/knowledge-base.ts + 注册

**Files:**
- Create: `packages/sdk/src/modules/knowledge-base.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: 创建 SDK 模块**

创建 `packages/sdk/src/modules/knowledge-base.ts`（仿 [database.ts](packages/sdk/src/modules/database.ts)）：

```typescript
import type { HttpClient } from '../client';
import type {
  KnowledgeBase, KbFile, KnowledgeBaseStats, KbQueryResult, KbAddFileBody,
} from '@agent-spaces/shared';

export function createKnowledgeBaseApi(http: HttpClient) {
  return {
    list: (workspaceId: string): Promise<KnowledgeBase[]> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases`),

    create: (workspaceId: string, data: { name: string; description?: string; chunkSize?: number; chunkOverlap?: number }): Promise<KnowledgeBase> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases`, data),

    update: (workspaceId: string, kbId: string, data: Partial<Pick<KnowledgeBase, 'name' | 'description' | 'embeddingModelId' | 'chunkSize' | 'chunkOverlap'>>): Promise<KnowledgeBase> =>
      http.put(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}`, data),

    delete_: (workspaceId: string, kbId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}`),

    stats: (workspaceId: string, kbId: string): Promise<KnowledgeBaseStats> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/stats`),

    bindEmbeddingModel: (workspaceId: string, kbId: string, embeddingModelId: string | null): Promise<KnowledgeBase> =>
      http.put(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/embedding-model`, { embeddingModelId }),

    listFiles: (workspaceId: string, kbId: string): Promise<KbFile[]> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files`),

    addFile: (workspaceId: string, kbId: string, body: KbAddFileBody): Promise<KbFile> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files`, body),

    getFile: (workspaceId: string, kbId: string, fileId: string): Promise<KbFile> =>
      http.get(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files/${fileId}`),

    deleteFile: (workspaceId: string, kbId: string, fileId: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files/${fileId}`),

    reindexFile: (workspaceId: string, kbId: string, fileId: string): Promise<KbFile> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/files/${fileId}/reindex`),

    query: (workspaceId: string, kbId: string, body: { query: string; topK?: number }): Promise<KbQueryResult> =>
      http.post(`/api/workspaces/${workspaceId}/knowledge-bases/${kbId}/query`, body),
  };
}
```

- [ ] **Step 2: 在 sdk index 注册**

修改 `packages/sdk/src/index.ts`（3 处，参照 database 注册）：
1. 顶部 export 区加：
```typescript
export { createKnowledgeBaseApi } from './modules/knowledge-base';
```
2. `SDK` interface 加字段：
```typescript
readonly knowledgeBase: ReturnType<typeof createKnowledgeBaseApi>;
```
3. `createSDK` 工厂返回对象加：
```typescript
knowledgeBase: createKnowledgeBaseApi(http),
```

- [ ] **Step 3: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: sdk 构建成功，`sdk.knowledgeBase.*` 可用。

- [ ] **Step 4: 提交**

```bash
git add packages/sdk/src/modules/knowledge-base.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add knowledge base module"
```

---

## Phase 9: 前端节点定义 + Picker

### Task 9.1: 节点定义 + 注册

**Files:**
- Create: `packages/web/src/lib/workflow-nodes/definitions/knowledge-base.ts`
- Modify: `packages/web/src/lib/workflow-nodes/definitions/index.ts`
- Modify: `packages/web/src/lib/workflow-nodes/registry.ts`

- [ ] **Step 1: 创建节点定义**

创建 `packages/web/src/lib/workflow-nodes/definitions/knowledge-base.ts`（仿 [sqlite.ts](packages/web/src/lib/workflow-nodes/definitions/sqlite.ts)）：

```typescript
import type { NodeTypeDefinition } from '@agent-spaces/shared';

const KB_PROP = {
  key: 'knowledgeBase',
  label: 'nodes.kb.props.knowledgeBase',
  type: 'knowledge-base' as const,
  required: true,
  tooltip: 'nodes.kb.props.knowledgeBase_tooltip',
};

export const knowledgeBaseNodes: NodeTypeDefinition[] = [
  {
    type: 'kb_add',
    label: 'nodes.kb_add.label',
    category: 'nodes.categories.knowledgeBase',
    icon: 'Library',
    description: 'nodes.kb_add.description',
    properties: [
      KB_PROP,
      { key: 'filePath', label: 'nodes.kb.props.filePath', type: 'text', required: true, tooltip: 'nodes.kb.props.filePath_tooltip' },
      { key: 'fileName', label: 'nodes.kb.props.fileName', type: 'text', tooltip: 'nodes.kb.props.fileName_tooltip' },
    ],
    outputs: [
      { key: 'fileId', type: 'string' },
      { key: 'fileName', type: 'string' },
      { key: 'chunkCount', type: 'number' },
      { key: 'status', type: 'string' },
    ],
  },
  {
    type: 'kb_query',
    label: 'nodes.kb_query.label',
    category: 'nodes.categories.knowledgeBase',
    icon: 'Search',
    description: 'nodes.kb_query.description',
    properties: [
      KB_PROP,
      { key: 'query', label: 'nodes.kb.props.query', type: 'textarea', required: true },
      { key: 'topK', label: 'nodes.kb.props.topK', type: 'number', default: 5 },
    ],
    outputs: [
      { key: 'matches', type: 'any' },
      { key: 'count', type: 'number' },
    ],
  },
  {
    type: 'kb_delete',
    label: 'nodes.kb_delete.label',
    category: 'nodes.categories.knowledgeBase',
    icon: 'Trash2',
    description: 'nodes.kb_delete.description',
    properties: [
      KB_PROP,
      { key: 'fileId', label: 'nodes.kb.props.fileId', type: 'text', required: true, tooltip: 'nodes.kb.props.fileId_tooltip' },
    ],
    outputs: [{ key: 'deletedCount', type: 'number' }],
  },
];
```

- [ ] **Step 2: 导出 + 聚合**

修改 `packages/web/src/lib/workflow-nodes/definitions/index.ts`，末尾加：
```typescript
export { knowledgeBaseNodes } from './knowledge-base';
```

修改 `packages/web/src/lib/workflow-nodes/registry.ts`：import `knowledgeBaseNodes` 并加入 `allNodeDefinitions` 数组（仿其他节点导入）。

- [ ] **Step 3: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: web 构建成功，3 节点进入节点库。

- [ ] **Step 4: 提交**

```bash
git add packages/web/src/lib/workflow-nodes/definitions/knowledge-base.ts packages/web/src/lib/workflow-nodes/definitions/index.ts packages/web/src/lib/workflow-nodes/registry.ts
git commit -m "feat(web): add kb_add/kb_query/kb_delete node definitions"
```

### Task 9.2: KnowledgeBasePicker + properties case

**Files:**
- Create: `packages/web/src/components/workflow/workflow-fields-knowledge-base.tsx`
- Modify: `packages/web/src/components/workflow/workflow-fields-property.tsx`

- [ ] **Step 1: 创建 Picker**

创建 `packages/web/src/components/workflow/workflow-fields-knowledge-base.tsx`（仿 [workflow-fields-sqlite.tsx](packages/web/src/components/workflow/workflow-fields-sqlite.tsx)）：

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/sdk';
import { useTranslations } from 'next-intl';
import { workspaceIdFromLocation } from '@/lib/routes';
import { KnowledgeBaseListDialog } from './knowledge-base-list-dialog';
import { usePathname } from 'next/navigation';

export function KnowledgeBasePicker({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [kbName, setKbName] = useState('');
  const pathname = usePathname();
  const workspaceId = workspaceIdFromLocation(pathname, typeof window !== 'undefined' ? window.location.search : '');

  useEffect(() => {
    let active = true;
    if (!value || !workspaceId) { setKbName(''); return; }
    sdk.knowledgeBase.list(workspaceId).then((list) => {
      if (!active) return;
      setKbName(list.find((k) => k.id === value)?.name ?? value);
    }).catch(() => { if (active) setKbName(value); });
    return () => { active = false; };
  }, [value, workspaceId]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 flex-1 items-center rounded-md border bg-muted/40 px-2 text-xs">
        <Library className="mr-1.5 size-3.5 text-muted-foreground" />
        <span className="truncate">{kbName || t('knowledgeBase.pickerEmpty')}</span>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        {t('knowledgeBase.select')}
      </Button>
      <KnowledgeBaseListDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId ?? ''}
        mode="pick"
        onPicked={(id) => { onChange(id); setOpen(false); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: properties 加 case**

修改 `packages/web/src/components/workflow/workflow-fields-property.tsx`：
- 顶部 import 加：
```typescript
import { KnowledgeBasePicker } from './workflow-fields-knowledge-base';
```
- 在 switch 的 `case 'sqlite':`（约 151 行）后加：
```typescript
case 'knowledge-base':
  return <KnowledgeBasePicker value={String(value ?? '')} onChange={(v) => onChange(v)} />;
```

- [ ] **Step 3: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: 成功（KnowledgeBaseListDialog 在 Task 10 创建后才能完整工作；本步先确认类型/导入无误，可能因 list-dialog 未创建而构建失败——若失败，先做 Task 10.1 再回来验证）。

- [ ] **Step 4: 提交**

```bash
git add packages/web/src/components/workflow/workflow-fields-knowledge-base.tsx packages/web/src/components/workflow/workflow-fields-property.tsx
git commit -m "feat(web): add KnowledgeBasePicker property control"
```

---

## Phase 10: 列表对话框

### Task 10.1: knowledge-base-list-dialog.tsx

**Files:**
- Create: `packages/web/src/components/workflow/knowledge-base-list-dialog.tsx`

仿 [sqlite-database-list-dialog.tsx](packages/web/src/components/workflow/sqlite-database-list-dialog.tsx)：列表 + pick/manage 模式 + 新建/删除。

- [ ] **Step 1: 创建列表对话框**

创建 `packages/web/src/components/workflow/knowledge-base-list-dialog.tsx`：

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, FolderOpen, Library } from 'lucide-react';
import { sdk } from '@/lib/sdk';
import type { KnowledgeBase } from '@agent-spaces/shared';
import { KnowledgeBaseDetailDialog } from './knowledge-base-detail-dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  mode?: 'pick' | 'manage';
  onPicked?: (id: string) => void;
}

export function KnowledgeBaseListDialog({ open, onOpenChange, workspaceId, mode = 'manage', onPicked }: Props) {
  const t = useTranslations();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try { setKbs(await sdk.knowledgeBase.list(workspaceId)); } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await sdk.knowledgeBase.create(workspaceId, { name: newName.trim() });
    setNewName(''); setCreating(false); load();
  };

  const handleDelete = async (kb: KnowledgeBase) => {
    if (!window.confirm(t('knowledgeBase.confirmDelete'))) return;
    await sdk.knowledgeBase.delete_(workspaceId, kb.id);
    load();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Library className="size-4" />{t('knowledgeBase.listTitle')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            {!creating ? (
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="size-3.5" />{t('knowledgeBase.create')}</Button>
            ) : (
              <>
                <Input className="h-8 text-xs flex-1" placeholder={t('knowledgeBase.namePlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                <Button size="sm" className="h-8" onClick={handleCreate}>{t('knowledgeBase.confirm')}</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setCreating(false); setNewName(''); }}>{t('knowledgeBase.cancel')}</Button>
              </>
            )}
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            {loading && kbs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">{t('knowledgeBase.loading')}</div>
            ) : kbs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">{t('knowledgeBase.empty')}</div>
            ) : kbs.map((kb) => (
              <div key={kb.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-0 hover:bg-muted/40">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => { if (mode === 'pick') onPicked?.(kb.id); else setDetailId(kb.id); }}
                >
                  <Library className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{kb.name}</span>
                  {mode === 'manage' && <FolderOpen className="size-3.5 text-muted-foreground" />}
                </button>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(kb)}><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {detailId && (
        <KnowledgeBaseDetailDialog
          workspaceId={workspaceId}
          kbId={detailId}
          onClose={() => { setDetailId(null); load(); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: 成功（依赖 KnowledgeBaseDetailDialog，Task 12 创建；若失败先做 Task 12.1）。

- [ ] **Step 3: 提交**

```bash
git add packages/web/src/components/workflow/knowledge-base-list-dialog.tsx
git commit -m "feat(web): add knowledge base list dialog"
```

---

## Phase 11: 设置对话框

### Task 11.1: knowledge-base-settings-dialog.tsx

**Files:**
- Create: `packages/web/src/components/workflow/knowledge-base-settings-dialog.tsx`

用 `AgentPickerDialog`（[agent-picker-dialog.tsx](packages/web/src/components/common/agent-picker-dialog.tsx)）选 embedding 模型；`models` 取自 `useLLMStore`。

- [ ] **Step 1: 确认 LLM store hook 名**

执行者确认 web 的 LLM store 导出 hook 名（搜 `useLLMStore` 或 `stores/llm`）。下面以 `useLLMStore` 为例，按实际替换。

- [ ] **Step 2: 创建设置对话框**

创建 `packages/web/src/components/workflow/knowledge-base-settings-dialog.tsx`：

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import { sdk } from '@/lib/sdk';
import { useLLMStore } from '@/stores/llm';
import type { KnowledgeBase } from '@agent-spaces/shared';

export function KnowledgeBaseSettingsDialog({ workspaceId, kb, onClose }: {
  workspaceId: string;
  kb: KnowledgeBase;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { models } = useLLMStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chunkSize, setChunkSize] = useState(kb.chunkSize);
  const [chunkOverlap, setChunkOverlap] = useState(kb.chunkOverlap);
  const [embeddingModelId, setEmbeddingModelId] = useState(kb.embeddingModelId);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setChunkSize(kb.chunkSize); setChunkOverlap(kb.chunkOverlap); setEmbeddingModelId(kb.embeddingModelId); }, [kb]);

  const embeddingModels = models.filter((m) => m.embedding);
  const agentsAsModels = embeddingModels.map((m) => ({
    id: m.id, name: m.name, description: `${m.provider}/${m.modelId}`,
  }));
  const boundModel = models.find((m) => m.id === embeddingModelId);

  const save = async () => {
    setSaving(true);
    try {
      await sdk.knowledgeBase.update(workspaceId, kb.id, { chunkSize, chunkOverlap });
      await sdk.knowledgeBase.bindEmbeddingModel(workspaceId, kb.id, embeddingModelId);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('knowledgeBase.settingsTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold">{t('knowledgeBase.embeddingModel')}</div>
              <div className="mt-1 text-xs text-muted-foreground">{boundModel ? `${boundModel.name} (${boundModel.provider})` : t('knowledgeBase.noModel')}</div>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setPickerOpen(true)}>{t('knowledgeBase.changeModel')}</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('knowledgeBase.chunkSize')}</label>
                <Input type="number" className="h-8 text-xs" value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('knowledgeBase.chunkOverlap')}</label>
                <Input type="number" className="h-8 text-xs" value={chunkOverlap} onChange={(e) => setChunkOverlap(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>{t('knowledgeBase.cancel')}</Button>
            <Button size="sm" onClick={save} disabled={saving}>{t('knowledgeBase.save')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <AgentPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSubmit={(ids) => { setEmbeddingModelId(ids[0] ?? null); setPickerOpen(false); }}
        title={t('knowledgeBase.pickEmbeddingModel')}
        description={t('knowledgeBase.pickEmbeddingModelDesc')}
        agents={agentsAsModels}
        initialSelected={embeddingModelId ? [embeddingModelId] : []}
        singleSelect
        confirmText={t('knowledgeBase.confirm')}
      />
    </>
  );
}
```

- [ ] **Step 3: 构建验证**

Run: `cd g:/agent_spaces && pnpm build`
Expected: 成功（确认 `useLLMStore` 路径与签名）。

- [ ] **Step 4: 提交**

```bash
git add packages/web/src/components/workflow/knowledge-base-settings-dialog.tsx
git commit -m "feat(web): add knowledge base settings dialog (embedding model via AgentPicker)"
```

---

## Phase 12: 详情对话框

### Task 12.1: knowledge-base-detail-dialog.tsx

**Files:**
- Create: `packages/web/src/components/workflow/knowledge-base-detail-dialog.tsx`

仿 [sqlite-data-browser-dialog.tsx](packages/web/src/components/workflow/sqlite-data-browser-dialog.tsx) 双栏 + 右上角按钮。左侧文件列表 + indexStatus 徽章，右侧 extractedText。

- [ ] **Step 1: 创建详情对话框**

创建 `packages/web/src/components/workflow/knowledge-base-detail-dialog.tsx`：

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings, Trash2, RotateCw, Plus, Loader2 } from 'lucide-react';
import { sdk } from '@/lib/sdk';
import { cn } from '@/lib/utils';
import type { KnowledgeBase, KbFile, KbFileIndexStatus } from '@agent-spaces/shared';
import { KnowledgeBaseSettingsDialog } from './knowledge-base-settings-dialog';

const STATUS_STYLE: Record<KbFileIndexStatus, string> = {
  indexed: 'bg-emerald-500/15 text-emerald-600',
  pending: 'bg-muted text-muted-foreground',
  indexing: 'bg-blue-500/15 text-blue-600',
  failed: 'bg-destructive/15 text-destructive',
};

export function KnowledgeBaseDetailDialog({ workspaceId, kbId, onClose }: {
  workspaceId: string;
  kbId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newText, setNewText] = useState('');

  const load = useCallback(async () => {
    const [k, fs] = await Promise.all([
      sdk.knowledgeBase.list(workspaceId).then((l) => l.find((x) => x.id === kbId) ?? null),
      sdk.knowledgeBase.listFiles(workspaceId, kbId),
    ]);
    setKb(k); setFiles(fs);
    setSelectedId((cur) => cur ?? fs[0]?.id ?? null);
  }, [workspaceId, kbId]);

  useEffect(() => { load(); }, [load]);

  // 有 pending/indexing 时轮询
  useEffect(() => {
    const hasPending = files.some((f) => f.indexStatus === 'pending' || f.indexStatus === 'indexing');
    if (!hasPending) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [files, load]);

  const selected = files.find((f) => f.id === selectedId) ?? null;

  const handleAdd = async () => {
    if (!newFileName.trim() || !newText.trim()) return;
    setAdding(true);
    try {
      // 项目无通用文件上传端点时,详情对话框用「文本入库」:
      // 先把文本写入一个临时文件(后端暂无此端点)→ 退化为让用户填 path/url。
      // MVP 做法:此处要求用户填写一个 workspace 内可读的文件路径。
      await sdk.knowledgeBase.addFile(workspaceId, kbId, { sourceType: 'path', sourceRef: newFileName, fileName: newFileName });
      setNewFileName(''); setNewText(''); load();
    } catch (e) { window.alert((e as Error).message); }
    finally { setAdding(false); }
  };

  const handleReindex = async (f: KbFile) => { await sdk.knowledgeBase.reindexFile(workspaceId, kbId, f.id); load(); };
  const handleDeleteFile = async (f: KbFile) => {
    if (!window.confirm(t('knowledgeBase.confirmDeleteFile'))) return;
    await sdk.knowledgeBase.deleteFile(workspaceId, kbId, f.id);
    if (selectedId === f.id) setSelectedId(null);
    load();
  };

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="!flex !h-[80vh] !w-[80vw] !max-w-[80vw] !flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {kb?.name ?? kbId}
              <Button variant="outline" size="sm" className="ml-auto h-7 me-5 gap-1 text-xs" onClick={() => setSettingsOpen(true)}>
                <Settings className="size-3.5" />{t('knowledgeBase.settings')}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 gap-2">
            {/* 左:文件列表 */}
            <div className="flex w-64 flex-col gap-2">
              <div className="flex flex-col gap-1 rounded-md border p-2">
                <Input className="h-7 text-xs" placeholder={t('knowledgeBase.fileNamePlaceholder')} value={newFileName} onChange={(e) => setNewFileName(e.target.value)} />
                <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={adding || !newFileName.trim()}>
                  {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}{t('knowledgeBase.addFile')}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                {files.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">{t('knowledgeBase.noFiles')}</div>
                ) : files.map((f) => (
                  <div key={f.id} className={cn('flex items-center gap-2 border-b px-2 py-1.5 last:border-0 hover:bg-muted/40', selectedId === f.id && 'bg-muted')}>
                    <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setSelectedId(f.id)}>
                      <span className={cn('inline-block size-2 rounded-full', STATUS_STYLE[f.indexStatus])} />
                      <span className="flex-1 truncate text-xs">{f.fileName}</span>
                    </button>
                    {f.indexStatus === 'failed' && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => handleReindex(f)} title={f.indexError ?? ''}><RotateCw className="size-3" /></button>}
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteFile(f)}><Trash2 className="size-3" /></button>
                  </div>
                ))}
              </div>
            </div>
            {/* 右:文件内容 */}
            <div className="flex min-h-0 flex-1 flex-col rounded-md border">
              {selected ? (
                <>
                  <div className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
                    {selected.fileName} · {selected.size}B · {selected.chunkCount} {t('knowledgeBase.chunks')} · {selected.sourceType}:{selected.sourceRef}
                    {selected.indexStatus === 'failed' && <span className="text-destructive"> · {selected.indexError}</span>}
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 text-xs">{selected.extractedText || t('knowledgeBase.noPreview')}</pre>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">{t('knowledgeBase.selectFile')}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {kb && settingsOpen && (
        <KnowledgeBaseSettingsDialog workspaceId={workspaceId} kb={kb} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}
```

> **加入文件的 MVP 说明**：详情对话框的"加入文件"在无通用上传端点时，要求用户填一个 workspace 可读路径（`sourceType:'path'`）。若执行者发现已有文件上传端点（搜 web 的 upload 调用），改为先上传拿路径再加入。文本直接入库（`newText`）需后端加一个 `sourceType:'text'` 分支——作为可选增强，本计划不展开（YAGNI，首版靠 path/url）。

- [ ] **Step 2: 构建验证**

Run: `cd g:/agent_spaces && pnpm build && cd packages/web && pnpm lint`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add packages/web/src/components/workflow/knowledge-base-detail-dialog.tsx
git commit -m "feat(web): add knowledge base detail dialog (file list + preview + settings)"
```

---

## Phase 13: i18n

### Task 13.1: knowledgeBase.json + nodes 命名空间

**Files:**
- Create: `packages/web/src/locales/en/knowledgeBase.json`
- Create: `packages/web/src/locales/zh/knowledgeBase.json`
- Modify: `packages/web/src/locales/en/index.ts`
- Modify: `packages/web/src/locales/zh/index.ts`
- Modify: nodes 命名空间文件（执行者 grep `sqlite_query` 定位，最可能在 `workflows.json` 的 `nodes` 键下）

- [ ] **Step 1: 创建 en/zh knowledgeBase.json**

`packages/web/src/locales/en/knowledgeBase.json`：
```json
{
  "listTitle": "Knowledge Bases",
  "create": "New",
  "confirm": "OK",
  "cancel": "Cancel",
  "save": "Save",
  "loading": "Loading...",
  "empty": "No knowledge bases",
  "namePlaceholder": "Knowledge base name",
  "fileNamePlaceholder": "File path or URL",
  "confirmDelete": "Delete this knowledge base?",
  "confirmDeleteFile": "Delete this file?",
  "pickerEmpty": "No knowledge base selected",
  "select": "Select",
  "settings": "Settings",
  "settingsTitle": "Knowledge Base Settings",
  "embeddingModel": "Embedding model",
  "noModel": "No model bound",
  "changeModel": "Change",
  "pickEmbeddingModel": "Select embedding model",
  "pickEmbeddingModelDesc": "Pick one embedding model for this knowledge base.",
  "chunkSize": "Chunk size",
  "chunkOverlap": "Chunk overlap",
  "addFile": "Add file",
  "noFiles": "No files",
  "chunks": "chunks",
  "noPreview": "No preview (unsupported format)",
  "selectFile": "Select a file"
}
```

`packages/web/src/locales/zh/knowledgeBase.json`：
```json
{
  "listTitle": "知识库",
  "create": "新建",
  "confirm": "确定",
  "cancel": "取消",
  "save": "保存",
  "loading": "加载中…",
  "empty": "暂无知识库",
  "namePlaceholder": "知识库名称",
  "fileNamePlaceholder": "文件路径或 URL",
  "confirmDelete": "确定删除该知识库？",
  "confirmDeleteFile": "确定删除该文件？",
  "pickerEmpty": "未选择知识库",
  "select": "选择",
  "settings": "设置",
  "settingsTitle": "知识库设置",
  "embeddingModel": "嵌入模型",
  "noModel": "未绑定模型",
  "changeModel": "更换",
  "pickEmbeddingModel": "选择嵌入模型",
  "pickEmbeddingModelDesc": "为该知识库选择一个嵌入模型。",
  "chunkSize": "分块大小",
  "chunkOverlap": "分块重叠",
  "addFile": "加入文件",
  "noFiles": "暂无文件",
  "chunks": "块",
  "noPreview": "无预览(暂不支持该格式)",
  "selectFile": "选择一个文件"
}
```

- [ ] **Step 2: 注册命名空间**

修改 `packages/web/src/locales/en/index.ts` 与 `zh/index.ts`，仿 database 注册：import `knowledgeBase` 并加入 `messages` 对象。

- [ ] **Step 3: 扩展 nodes 命名空间**

执行者 `grep -r "sqlite_query"` 定位 nodes 翻译所在文件（en + zh）。在该文件的 `nodes` 键下加：

```json
"categories": { "knowledgeBase": "Knowledge Base" },
"kb_add": { "label": "Add to KB", "description": "Add a file to a knowledge base (parse + chunk + embed)." },
"kb_query": { "label": "Query KB", "description": "Semantic search a knowledge base and return top matches." },
"kb_delete": { "label": "Delete from KB", "description": "Delete files from a knowledge base." },
"kb": { "props": {
  "knowledgeBase": "Knowledge base", "knowledgeBase_tooltip": "Target knowledge base",
  "filePath": "File path / URL", "filePath_tooltip": "Workspace file path or URL, supports {{upstream}} variables",
  "fileName": "File name", "fileName_tooltip": "Optional custom stored file name",
  "query": "Query", "topK": "Top K", "fileId": "File ID", "fileId_tooltip": "File id from upstream; comma-separated or array for multiple"
} }
```

（zh 版本对应中文。）

- [ ] **Step 4: 构建验证**

Run: `cd g:/agent_spaces && pnpm build && cd packages/web && pnpm lint`
Expected: 成功。

- [ ] **Step 5: 提交**

```bash
git add packages/web/src/locales/
git commit -m "feat(web): add knowledgeBase i18n namespace and node labels"
```

---

## Phase 14: 集成验证

### Task 14.1: 端到端手动验证

- [ ] **Step 1: 启动服务**

Run: `cd g:/agent_spaces && pnpm dev`
等待 server(3100) + web(3000) 就绪。

- [ ] **Step 2: 绑定一个 embedding 模型**

在 web 的 LLM 设置里确认至少一个模型 `embedding=true`（若无,在 models 里标记一个 embedding 模型 + 配 provider apiBase/key）。

- [ ] **Step 3: 验证知识库 CRUD + 索引 + 查询**

在 web 工作区：
1. 打开知识库列表对话框（经节点 picker 或管理入口），新建一个知识库。
2. 打开详情对话框 → 设置 → 绑定 embedding 模型 + 保存。
3. 加入一个 `.txt` 文件（填 workspace 内一个 txt 路径）→ 观察徽章 `pending → indexing → indexed`。
4. 加入一个 `.pdf`（或任意二进制）→ 观察徽章 `failed` + "暂不支持该格式"。
5. failed 文件点重试（仍 failed,验证不中断）。

- [ ] **Step 4: 验证工作流三节点**

新建工作流，拖入 `kb_add` → `kb_query` → `kb_delete`：
- `kb_add`: 选知识库,`filePath` 填一个 txt 路径(或用上游变量),运行 → 输出 `fileId/chunkCount/status=indexed`。
- `kb_query`: 选同一知识库,`query` 用上游变量或手输,`topK=3`,运行 → 输出 `matches[]/count`。
- `kb_delete`: `fileId` 用 `{{kb_add.fileId}}`,运行 → 输出 `deletedCount=1`。

- [ ] **Step 5: 验证文档数据库回归**

确认文档数据库向量功能（database-vector）在 embedding-util 抽离后仍正常：打开一个文档数据库,绑定 embedding 模型,点索引,确认成功。

- [ ] **Step 6: 提交（如有修复）**

若集成中发现 bug 并修复:
```bash
git add -A
git commit -m "fix: knowledge base integration adjustments"
```

- [ ] **Step 7: 完成**

子系统的 3 节点 + 3 对话框 + 后端完整链路全部可用。可按需开 PR 合入 main。

---

## Self-Review 已完成项

- ✅ **Spec coverage**：spec 第 2-6 节均有对应 Task（类型 Task1、embedding util Task2、parser Task3、store Task4、service Task5、route Task6、execution Task7、sdk Task8、节点 Task9、list Task10、settings Task11、detail Task12、i18n Task13、验收 Task14）。
- ✅ **Placeholder scan**：每步含实际代码或精确命令;multipart/上传端点的不确定性已显式标注为子任务而非占位。
- ✅ **Type consistency**：`KbFile`/`KnowledgeBase`/`KbQueryMatch` 字段在 store/service/route/sdk/前端一致;`indexStatus` 枚举三处一致;`knowledgeBase`(属性 key) / `kbId` / `fileId` 命名贯穿。
- ⚠️ **已知需执行时确认的点**（计划已标注,非占位）:
  1. `session.workflow.workspaceId` 字段路径(Task 7.1 Step 1)
  2. `safeSrcPath` 导出与签名(Task 6.1 Step 2)
  3. `useLLMStore` hook 名/路径(Task 11.1 Step 1)
  4. nodes 翻译所在文件(Task 13.1 Step 3,grep 定位)
  5. 路由挂载方式与 databaseRouter 对齐(Task 6.1 Step 3)
  6. 文件上传端点是否存在(Task 6.1/12.1 说明)
