// 音视频文案的 ASR 转写辅助。
//
// 文件本地落盘由宿主 FileUpload 组件（autoUpload）完成，选完即上传到 /api/upload，
// 回填 file.uploadedPath / file.uploadedHttpPath。
// 云存储转存（阿里云 OSS / 腾讯云 COS，按存储设置切换）见 utils/upload.js 的 uploadToCloud。
//
// callPluginTool 的 apiKey/baseUrl 由平台 getPluginConfig 自动注入，前端只传 fileUrls/model。

const PLUGIN_AI = 'workflow.aliyun-ai';
const ASR_MODEL = 'paraformer-v2';

// 公网 url → 转写文字。options.taskId/meta 触发任务事件编排。
export async function recognize(ossUrl, options = {}) {
  if (!ossUrl) throw new Error('缺少公网音频 URL');
  const opts = options.taskId ? { taskId: options.taskId, meta: options.meta } : undefined;
  const result = await window.AgentSpaces.callPluginTool(
    PLUGIN_AI,
    'asr_file_recognition',
    { model: ASR_MODEL, fileUrls: [ossUrl] },
    opts,
  );
  const text = result?.data?.text;
  if (!text) throw new Error(result?.message || 'ASR 未返回转写文本');
  return text;
}

// 用 HTMLMediaElement 读取音视频时长（秒），失败返回 0
export function getMediaDuration(file) {
  return new Promise((resolve) => {
    if (!file || typeof document === 'undefined') return resolve(0);
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type && file.type.startsWith('video/') ? 'video' : 'audio');
    el.preload = 'metadata';
    const done = (v) => { try { URL.revokeObjectURL(url); } catch { /* noop */ } resolve(v); };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

// 前端预生成短 taskId，对齐平台任务事件（taskId 由发起方与后端 cache 共用）
export function genTaskId(prefix = 'asr') {
  const c = (globalThis.crypto)?.randomUUID?.();
  return c ? `${prefix}-${c}` : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
