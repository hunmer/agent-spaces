// 向量索引/查询封装（参考 copywriting/src/utils/knowledge-base.js）。
import { KB_ID } from './constants.js';

function unwrap(result) {
  return result?.result || result;
}

// 索引单个文档。nodeId 编码进 title 前缀以支持回连。
export async function indexNode(node) {
  if (!node || !String(node.content || '').trim()) return null;
  const title = `node:${node.id} ${node.title || 'untitled'}`;
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_add_text', {
    knowledgeBase: KB_ID,
    title,
    text: node.content,
  });
  return unwrap(result); // { fileId, fileName, chunkCount, status }
}

export async function queryNodes(query, topK = 8) {
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_query', {
    knowledgeBase: KB_ID,
    query,
    topK,
  });
  const data = unwrap(result);
  // 回连 nodeId：从 title 前缀 node:<id> 解析
  const matches = (data?.matches || []).map((m) => {
    const matched = String(m?.title || m?.fileName || '').match(/^node:([^\s]+)\s*/);
    return { ...m, nodeId: matched ? matched[1] : null, score: m?.score ?? 0 };
  });
  return { matches, count: data?.count ?? matches.length };
}

export async function deleteIndexed(fileId) {
  if (!fileId) return;
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_delete', {
    knowledgeBase: KB_ID,
    fileId,
  });
  return unwrap(result);
}
