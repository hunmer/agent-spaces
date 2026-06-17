export const COPYWRITING_KB_ID = 'copywriting-fixed-knowledge-base';

function unwrap(result) {
  return result?.result || result;
}

export async function addCopywritingToKnowledgeBase(item) {
  const text = item.type === 'text' ? (item.content || '') : (item.transcription || '');
  if (!String(text).trim()) throw new Error('文稿内容为空，无法入库');
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_add_text', {
    knowledgeBase: COPYWRITING_KB_ID,
    title: item.title || `copywriting-${item.id}`,
    text,
  });
  return unwrap(result);
}

export async function queryCopywritingKnowledgeBase(query, topK = 5) {
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_query', {
    knowledgeBase: COPYWRITING_KB_ID,
    query,
    topK,
  });
  return unwrap(result);
}

export async function deleteCopywritingKnowledgeBaseFile(fileId) {
  if (!fileId) return;
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_delete', {
    knowledgeBase: COPYWRITING_KB_ID,
    fileId,
  });
  return unwrap(result);
}
