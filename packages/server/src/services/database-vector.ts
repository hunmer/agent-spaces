import type { DatabaseVectorIndexResult, DatabaseVectorSearchResult } from '@agent-spaces/shared';
import * as databaseStore from '../storage/database-store.js';
import {
  INDEX_BATCH_SIZE,
  EmbeddingError,
  embedTexts,
  cosineSimilarity,
  hashText,
  normalizeIndexText,
  requireEmbeddingModelConfig,
  type EmbeddingDebug,
} from './embedding-util.js';

// 向后兼容别名：DatabaseVectorError, DatabaseVectorDebug
export const DatabaseVectorError = EmbeddingError;
export type DatabaseVectorDebug = EmbeddingDebug;

export async function indexDatabaseVectors(workspaceId: string, databaseId: string): Promise<DatabaseVectorIndexResult> {
  const database = databaseStore.getDatabase(workspaceId, databaseId);
  if (!database) throw new Error(`Database not found: ${databaseId}`);
  if (!database.embeddingModelId) throw new Error('Embedding model is not bound to this database.');

  const config = requireEmbeddingModelConfig(database.embeddingModelId);
  const nodes = databaseStore.listNodes(workspaceId, databaseId).filter((node) => !node.isTrash);
  const records = nodes
    .map((node) => ({
      node,
      path: buildDatabaseNodePath(node, nodes),
      text: normalizeIndexText(`${node.title}\n${stripHtml(node.content)}`),
    }))
    .filter((item) => item.text.length > 0);

  let indexedCount = 0;
  for (let index = 0; index < records.length; index += INDEX_BATCH_SIZE) {
    const batch = records.slice(index, index + INDEX_BATCH_SIZE);
    const batchDebug = {
      batchStart: index,
      batchSize: batch.length,
      indexedCount,
    };
    console.info('[database-vector:index] embedding batch', {
      workspaceId,
      databaseId,
      modelId: config.model.modelId,
      providerName: config.provider.name,
      ...batchDebug,
      inputLengths: batch.map((item) => item.text.length),
    });
    const embeddings = await embedTexts(config, batch.map((item) => item.text), batchDebug);
    embeddings.forEach((embedding, offset) => {
      const item = batch[offset];
      databaseStore.upsertDatabaseEmbedding(workspaceId, databaseId, {
        nodeId: item.node.id,
        title: item.node.title,
        path: item.path,
        content: item.text,
        contentHash: hashText(item.text),
        embedding,
        modelId: config.model.modelId,
        agentId: config.model.id,
      });
      indexedCount++;
    });
  }

  databaseStore.deleteStaleDatabaseEmbeddings(workspaceId, databaseId, records.map((item) => item.node.id));
  return {
    ...databaseStore.getVectorStats(workspaceId, databaseId),
    indexedCount,
    skippedCount: nodes.length - records.length,
  };
}

export async function searchDatabaseVectors(
  workspaceId: string,
  databaseId: string,
  query: string,
  limit = 5,
): Promise<DatabaseVectorSearchResult[]> {
  const database = databaseStore.getDatabase(workspaceId, databaseId);
  if (!database) throw new Error(`Database not found: ${databaseId}`);
  if (!database.embeddingModelId) throw new Error('Embedding model is not bound to this database.');

  const cleanQuery = normalizeIndexText(query);
  if (!cleanQuery) throw new Error('query is required.');

  const config = requireEmbeddingModelConfig(database.embeddingModelId);
  const [queryEmbedding] = await embedTexts(config, [cleanQuery]);
  return databaseStore.listDatabaseEmbeddings(workspaceId, databaseId)
    .map((row) => ({
      nodeId: row.nodeId,
      title: row.title,
      path: row.path,
      content: row.content,
      updatedAt: row.updatedAt,
      score: cosineSimilarity(queryEmbedding, row.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 20)));
}

function stripHtml(content: string): string {
  return content
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function buildDatabaseNodePath(node: { id: string; title: string; parentId: string | null }, nodes: Array<{ id: string; title: string; parentId: string | null }>): string {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const parts = [node.title || node.id];
  let parentId = node.parentId;
  let guard = 0;
  while (parentId && guard < 100) {
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.unshift(parent.title || parent.id);
    parentId = parent.parentId;
    guard++;
  }
  return `/${parts.join('/')}`;
}
