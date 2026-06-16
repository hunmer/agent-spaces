import { join, extname } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { v4 as uuid } from 'uuid';
import * as kbStore from '../storage/knowledge-base-store.js';
import { extractText, chunkText, UnsupportedFormatError } from './knowledge-base-parser.js';
import {
  INDEX_BATCH_SIZE, embedTexts, cosineSimilarity, hashText,
  normalizeIndexText, requireEmbeddingModelConfig,
} from './embedding-util.js';
import type {
  KnowledgeBase, KbFile, KnowledgeBaseStats, KbQueryResult, KbQueryMatch,
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

function storagePathFor(kbId: string, fileId: string, fileName: string): string {
  const dir = kbStore.ensureKbDir(kbId);
  const ext = extname(fileName) || '';
  return join(dir, `${fileId}${ext}`);
}

/** 核心:加入文件 + 索引。失败写 failed 状态并返回(不抛),调用方据 indexStatus 判断。
 *  options.background=true 时立即返回 pending,后台索引(详情对话框 fire-and-forget,前端轮询);
 *  默认(工作流)同步 await,返回最终状态(indexed/failed)。 */
export async function addFileToKnowledgeBase(
  workspaceId: string,
  kbId: string,
  input: { sourceType: 'upload' | 'path' | 'url'; sourceRef: string; fileName: string; buffer?: Buffer },
  options?: { background?: boolean },
): Promise<KbFile> {
  const kb = kbStore.getKb(workspaceId, kbId);
  if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);

  let buffer: Buffer;
  if (input.sourceType === 'upload' && input.buffer) {
    buffer = input.buffer;
  } else if (input.sourceType === 'path') {
    buffer = readFileSync(input.sourceRef);
  } else {
    const resp = await fetch(input.sourceRef);
    if (!resp.ok) throw new Error(`下载失败 ${resp.status}: ${input.sourceRef}`);
    buffer = Buffer.from(await resp.arrayBuffer());
  }

  const fileId = uuid();
  const storagePath = storagePathFor(kbId, fileId, input.fileName);
  writeFileSync(storagePath, buffer);

  const file = kbStore.addFile({
    id: fileId, kbId, fileName: input.fileName, mimeType: guessMime(input.fileName),
    size: buffer.length, sourceType: input.sourceType, sourceRef: input.sourceRef,
    storagePath, extractedText: '', chunkCount: 0,
    indexStatus: 'pending', indexError: null, indexedAt: null,
  });

  if (options?.background) {
    // 详情对话框:fire-and-forget,立即返回 pending,前端轮询状态流转(pending->indexing->indexed/failed)
    setImmediate(() => { indexFile(kb, file).catch(() => { /* 状态已在 indexFile 内写 failed */ }); });
    return file; // status=pending
  }
  // 工作流:同步等待,返回最终状态
  await indexFile(kb, file).catch(() => { /* 状态已在 indexFile 内写 failed */ });
  return kbStore.getFile(workspaceId, kbId, fileId)!;
}

async function indexFile(kb: KnowledgeBase, file: KbFile): Promise<void> {
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
        const piece = batch[offset];
        kbStore.upsertChunk({
          chunkId: `${file.id}_${i + offset}`, kbId: kb.id, fileId: file.id,
          chunkIndex: i + offset, text: piece, contentHash: hashText(piece),
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

export async function reindexFile(
  workspaceId: string, kbId: string, fileId: string, options?: { background?: boolean },
): Promise<KbFile> {
  const kb = kbStore.getKb(workspaceId, kbId);
  if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);
  const file = kbStore.getFile(workspaceId, kbId, fileId);
  if (!file) throw new Error(`File not found: ${fileId}`);
  if (options?.background) {
    // 详情对话框重试:fire-and-forget,立即返回当前状态,前端轮询 indexing->indexed/failed
    setImmediate(() => { indexFile(kb, file).catch(() => {}); });
    return file;
  }
  await indexFile(kb, file).catch(() => {});
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

export function deleteFileFromKb(workspaceId: string, kbId: string, fileId: string): void {
  if (!kbStore.getFile(workspaceId, kbId, fileId)) throw new Error('File not found');
  kbStore.deleteFile(kbId, fileId);
}

export function getStats(workspaceId: string, kbId: string): KnowledgeBaseStats {
  return kbStore.getKbStats(workspaceId, kbId);
}
