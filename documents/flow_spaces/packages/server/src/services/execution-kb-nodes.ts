import * as kbService from '../services/knowledge-base.js';

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

export async function executeKbDelete(
  resolvedData: Record<string, any>,
  workspaceId: string,
): Promise<{ deletedCount: number }> {
  const kbId = String(resolvedData.knowledgeBase || '');
  const ids = parseIds(resolvedData.fileId);
  if (!kbId) throw new Error('未选择知识库');
  let deletedCount = 0;
  for (const fileId of ids) {
    try { kbService.deleteFileFromKb(workspaceId, kbId, fileId); deletedCount++; }
    catch (e) { console.warn('[kb_delete] skip file', fileId, (e as Error)?.message ?? e); }
  }
  return { deletedCount };
}
