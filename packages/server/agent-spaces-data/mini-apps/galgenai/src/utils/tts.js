// 替代原 services/ttsService.ts。
// 不再直连 MiniMax / 浏览器语音，改走 text_to_voice 工作流
// （id: 820bf3b7-9d50-4f6d-966d-8e442960a233，输入 prompt/model/voiceId，结束节点返回 result.audio）。

import { BUILTIN_PLUGIN, DEFAULT_TTS_WORKFLOW_ID } from './constants';

// 移植自原 cleanTextForTTS：去除 emoji 和符号，避免 TTS 朗读乱码
export function cleanTextForTTS(text) {
  if (!text) return '';
  let clean = text.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    '',
  );
  clean = clean.replace(/[*~^<>\[\]\{\}\(\)\-_=+\/\\|#@]/g, ' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

// 从 execute_workflow_sync 返回结构中找到结束节点（nodeId 末尾为 _end 或不是错误分支）的 result.audio
// text_to_voice 有两个 end 节点：错误分支返回 {error}，成功分支返回 {result: audio}。
function extractAudioUrlFromWorkflow(result) {
  let payload = result;
  // 层层解包
  for (let i = 0; i < 5; i += 1) {
    if (!payload || typeof payload !== 'object') break;
    if (Array.isArray(payload.steps) || payload.status || payload.workflow_id) break;
    if (payload.result && typeof payload.result === 'object') {
      payload = payload.result;
      continue;
    }
    if (payload.data && typeof payload.data === 'object') {
      payload = payload.data;
      continue;
    }
    break;
  }

  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  // text_to_voice 的成功结束节点 id 固定为 node_1782272191524_rvv1lk
  const SUCCESS_END_ID = 'node_1782272191524_rvv1lk';
  const endStep =
    steps.find((s) => s?.nodeId === SUCCESS_END_ID) ||
    steps.find((s) => String(s?.nodeId || '').endsWith('_end') && s?.status === 'completed' && s?.output?.result);

  let audio = endStep?.output?.result;
  if (audio && typeof audio === 'object') {
    // 工作流聚合节点 result.audio 是对象，里面是各 provider 的 data
    audio = audio.audio || audio;
  }
  // 各 provider data 字段差异：minimax=audioUrl，fish-audio=httpPath，qianyin=fileUrl
  const url =
    (audio && typeof audio === 'object' && (audio.audioUrl || audio.httpPath || audio.fileUrl || audio.url)) ||
    (typeof audio === 'string' ? audio : null) ||
    null;
  return url;
}

// 调用 TTS 工作流合成语音，返回可直接播放的 URL；失败返回空字符串。
// workflowId 由调用方传入（来自 settings.ttsWorkflowId，默认 text_to_voice）。
export async function synthesizeSpeech({ text, provider, voiceId, workflowId }) {
  const clean = cleanTextForTTS(text);
  if (!clean) return '';

  const wfId = workflowId || DEFAULT_TTS_WORKFLOW_ID;
  const result = await window.AgentSpaces.callPluginTool(BUILTIN_PLUGIN, 'execute_workflow_sync', {
    workflow_id: wfId,
    input: {
      prompt: clean,
      model: provider,
      ...(voiceId ? { voiceId } : {}),
    },
    max_wait_ms: 120000,
  });

  const url = extractAudioUrlFromWorkflow(result);
  if (!url) {
    console.warn('[tts] 未提取到音频 URL，原始返回：', result);
  }
  return url;
}

// 用 <audio> 播放一个 URL；返回正在播放的 Audio 元素
export function playAudioUrl(url) {
  if (!url) return null;
  const audio = new Audio(url);
  audio.play().catch((e) => console.error('[tts] 播放失败：', e));
  return audio;
}
