import { BUILTIN_PLUGIN, EXEC_TOOL } from './constants';
import { getImageCompression } from './image-ops/cdn';

// 同步等待上限 10 分钟（execute_workflow_sync 的 MAX_WORKFLOW_SYNC_TIMEOUT_MS）
// jimeng/可灵等异步图片生成往往超过默认 120s，必须给足等待时间
const MAX_WAIT_MS = 600_000;

/**
 * 规范化图片 URL：相对路径（如 /static/uploads/xxx.png）补全为完整 http URL。
 * 工作流返回的可能是相对路径，浏览器同源能展示，但提交给工作流后端下载时需要完整 URL。
 * data: URI / 已是 http(s) 的原样返回。
 */
export function normalizeImageUrl(url) {
  if (!url) return url;
  const s = String(url);
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  if (s.startsWith('/')) return `${window.location.origin}${s}`;
  return s;
}

export function normalizeImageUrls(urls) {
  if (!Array.isArray(urls)) return urls;
  return urls.map(normalizeImageUrl);
}

// 后端图片路由特征：/api/mini-apps/<projectId>/(data/file|src/file|local-file|proxy-image)
// 与 host API proxyImageUrl/dataFileUrl/srcFileUrl/localFileUrl 产出的 URL 一致。
const BACKEND_IMAGE_PATH_RE = /\/api\/mini-apps\/[^/]+\/(data\/file|src\/file|local-file|proxy-image)/;

/**
 * 判定图片 URL 是否已是后端地址（无需再下载落地）。
 * - data:/blob:/非 http(s) 协议：本地内联或相对后端路径，视为后端地址
 * - 同源 + 路径匹配后端图片路由：后端地址
 * - 其余（外链 http(s)）：非后端地址
 */
export function isBackendUrl(url) {
  if (!url) return true;
  const s = String(url);
  if (/^(data:|blob:)/.test(s)) return true;
  if (!/^https?:\/\//i.test(s)) return true;
  try {
    const u = new URL(s);
    if (u.origin === window.location.origin && BACKEND_IMAGE_PATH_RE.test(u.pathname)) return true;
  } catch { /* 非法 URL 保守视为后端，避免误下载 */ }
  return false;
}

/**
 * 把非后端图片 URL 下载到后端 data 目录并替换为后端 httpUrl。
 * 单张失败保留原地址（不阻塞整体展示）。
 * @param {string[]} urls 已规范化的完整 http URL 数组
 * @returns {Promise<string[]>} 后端化后的 URL 数组（顺序保持）
 */
export async function persistImagesToBackend(urls) {
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    if (!url) continue;
    if (isBackendUrl(url)) { out.push(url); continue; }
    try {
      const downloadImage = window.AgentSpaces?.downloadImage;
      if (typeof downloadImage !== 'function') throw new Error('宿主 downloadImage 不可用');
      const res = await downloadImage(url);
      out.push(res?.httpUrl || url);
    } catch (err) {
      // 下载失败保留原始外链，至少能展示
      console.warn('persistImagesToBackend failed:', url, err);
      out.push(url);
    }
  }
  return out;
}

/**
 * URL 数组去重保序（按字符串值）。用于把多来源图片（参考图/上传图/连线图）合并成统一输入列表。
 * @param {string[]} urls
 * @returns {string[]}
 */
export function dedupeUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const u of Array.isArray(urls) ? urls : []) {
    const s = String(u || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * 把提示词条目的 references（相对 src 目录的路径数组，如 ['assets/references/<id>/ref1.png']）
 * 解析为可直接用于 <img>/提交给工作流的 http URL 数组。
 * 走 host 暴露的 window.AgentSpaces.srcFileUrl（对应 /api/mini-apps/<id>/src/file 路由）。
 * references 为空/缺省时返回空数组。
 */
export function resolveReferenceImages(references) {
  if (!Array.isArray(references) || references.length === 0) return [];
  const srcFileUrl = window?.AgentSpaces?.srcFileUrl;
  if (typeof srcFileUrl !== 'function') return [];
  return references.map((rel) => srcFileUrl(rel)).filter(Boolean);
}

/**
 * 把 PromptTextEditor 产出的 HTML 转成提交给工作流的纯文本指令。
 *
 * - <span class="prompt-mention" data-key="R0">…</span>（tiptap mention 节点）→ 替换为对应参考关键字（R0/R1…）。
 *   无 data-key 时回退用 data-label 或原文本。
 * - <br> / </p><p> → 换行；其余 HTML 标签剥离；&nbsp; 等实体解码。
 * - 多余空行折叠，首尾空白裁剪。
 *
 * @param {string} html PromptTextEditor onChange 回传的 HTML
 * @returns {string} 纯文本指令（含 R0/R1 关键字）
 */
export function promptHtmlToText(html) {
  if (!html) return '';
  // 用 DOMParser 解析，避免手写正则漏标签（mini-app 运行在浏览器，DOMParser 可用）
  let doc;
  try {
    doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  } catch {
    // 兜底：粗暴去标签
    return String(html)
      .replace(/<br\s*\/?>(<\/p>)?/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  const root = doc.body.firstChild;
  if (!root) return '';
  // 把 mention span 替换成其关键字文本，再取整体 textContent
  root.querySelectorAll('.prompt-mention, [data-mention]').forEach((el) => {
    const key = el.getAttribute('data-key') || el.getAttribute('data-label') || el.textContent || '';
    el.replaceWith(doc.createTextNode(String(key)));
  });
  // <br> / 段落转换行
  let text = root.innerHTML;
  const tmp = doc.createElement('div');
  tmp.innerHTML = text
    .replace(/<br\s*\/?>(<\/p>)?/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  text = tmp.textContent || '';
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 提取 PromptTextEditor HTML 中所有 mention 节点引用的参考图 URL（按出现顺序）。
 * 用于提交时把这些参考图也纳入 input.images（即便用户没手动加进输入图区）。
 * @param {string} html
 * @returns {string[]} 参考图 URL 数组（去重保序）
 */
export function extractMentionedReferences(html) {
  if (!html) return [];
  let doc;
  try {
    doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  } catch {
    return [];
  }
  const root = doc.body.firstChild;
  if (!root) return [];
  const urls = [];
  const seen = new Set();
  root.querySelectorAll('.prompt-mention, [data-mention]').forEach((el) => {
    const url = el.getAttribute('data-url');
    if (url && !seen.has(url)) { seen.add(url); urls.push(url); }
  });
  return urls;
}

/**
 * 同步执行工作流，返回 end 节点的 output 对象。
 * @param {string} workflowId
 * @param {Record<string, unknown>} input start 节点 inputFields 的值
 * @param {{ meta?: Record<string, unknown>, returnRawEndOutput?: boolean }} [opts]
 *   returnRawEndOutput: true 时跳过图片专用提取，直接返回首个 completed end 节点的完整 output
 *   （供音频/视频等非图片媒体节点使用）
 * @returns {Promise<Record<string, unknown>>} end 节点 outputs（如 { result: [url...] }）
 */
export async function runWorkflow(workflowId, input, opts = {}) {
  const res = await window.AgentSpaces.callPluginTool(
    BUILTIN_PLUGIN,
    EXEC_TOOL,
    { workflow_id: workflowId, input, fault_tolerance: 'stop', max_wait_ms: MAX_WAIT_MS },
    { meta: { workflowId, ...(opts.meta || {}) } },
  );

  // 兼容 { success, result } 包装
  const data = res && typeof res === 'object' && 'result' in res && typeof res.success === 'boolean'
    ? res.result
    : res;

  const status = data?.status;
  const timedOut = !!data?.timedOut;
  const steps = Array.isArray(data?.steps) ? data.steps : [];

  // 媒体节点（音频/视频）：直接拿 end 节点完整 output，不走图片专用提取
  if (opts.returnRawEndOutput) {
    const endStep = [...steps].reverse().find(
      (s) => s?.nodeType === 'end' && s?.status === 'completed',
    );
    if (endStep?.output) return endStep.output;
    if (timedOut) throw new Error('工作流执行超时（>10分钟），未返回结果');
    if (status && status !== 'completed') {
      const errStep = [...steps].reverse().find((s) => s?.error && s.status !== 'skipped');
      throw new Error(errStep?.error || `工作流未完成: ${status}`);
    }
    return {};
  }

  // 先尝试从 steps 提取结果（即便超时，生成节点可能已产出图片）
  const output = extractOutput(steps);
  if (output) return output;

  // 没提取到结果，按状态报错
  if (timedOut) {
    throw new Error('工作流执行超时（>10分钟），未返回结果');
  }
  if (status && status !== 'completed') {
    // 从 steps 找错误信息
    const errStep = [...steps].reverse().find((s) => s?.error && s.status !== 'skipped');
    throw new Error(errStep?.error || `工作流未完成: ${status}`);
  }
  // status=completed 但无 output，返回空让调用方处理
  return {};
}

/**
 * 从执行 steps 里提取图片结果（多路径兜底）：
 * 1. 最后一个 type=end 且 status=completed 的 output.result / output.images
 * 2. 生成节点 output.data.images（如 jimeng/aliyun 节点结构）
 * 3. 任意 completed 节点 output.result / output.images
 * 返回 output 对象（{ result: string[] } 形式）或 null
 */
function extractOutput(steps) {
  if (!steps.length) return null;

  // 1. 优先：end 节点且已完成
  const endStep = [...steps].reverse().find(
    (s) => s?.nodeType === 'end' && s?.status === 'completed',
  );
  if (endStep?.output) {
    const out = endStep.output;
    if (hasImages(out)) return out;
  }

  // 2. 生成节点的 output.data.images（jimeng_text_to_image / aliyun_text_to_image 等）
  for (const s of [...steps].reverse()) {
    if (s?.status !== 'completed') continue;
    const out = s.output;
    if (!out) continue;
    // data.images 结构
    if (out.data?.images && Array.isArray(out.data.images)) {
      return { result: out.data.images };
    }
    // 直接 images 结构
    if (hasImages(out)) return out;
  }

  return null;
}

function hasImages(out) {
  return Array.isArray(out?.result) || Array.isArray(out?.images) || Array.isArray(out?.image_urls);
}

/**
 * 执行文生图/编辑图片工作流，返回图片 URL 数组。
 * 兼容多种 output 字段名：result / images / image_urls（image_enchanter 工作流 end 节点用 image_urls）。
 * @param {string} workflowId
 * @param {object} input
 * @returns {Promise<string[]>}
 */
export async function generateImages(workflowId, input) {
  const output = await runWorkflow(workflowId, input, { meta: { mode: workflowId } });
  const result = output?.result;
  let urls;
  if (Array.isArray(result)) urls = result.filter(Boolean);
  else if (Array.isArray(output?.images)) urls = output.images.filter(Boolean);
  else if (Array.isArray(output?.image_urls)) urls = output.image_urls.filter(Boolean);
  else if (typeof result === 'string' && result) urls = [result];
  else if (output?.error) throw new Error(output.error);
  else urls = [];
  // 规范化：相对路径补全为完整 http URL
  const normalized = normalizeImageUrls(urls);
  // 非后端地址的外链图统一下载到后端 data 目录并替换为后端 httpUrl，
  // 避免外链失效（防盗链/CORS/过期）导致节点图片丢失。失败保留原地址。
  return persistImagesToBackend(normalized);
}

/**
 * 从任意嵌套对象里提取首个非空字符串 URL（http/https/相对路径）。
 * 用于 audio/video 节点产出，结构可能为：直接 URL / {data:{httpPath|fileUrl|audioUrl|video|videoUrl}} / 其他。
 * @param {any} v
 * @returns {string|null}
 */
function pickFirstUrlDeep(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^(https?:\/|\/|data:)/i.test(s) && s.length < 4096) return s;
    return null;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = pickFirstUrlDeep(x);
      if (u) return u;
    }
    return null;
  }
  if (typeof v === 'object') {
    // 优先按已知字段名找（audio/video 节点常见结构）
    const keys = ['url', 'httpPath', 'fileUrl', 'audioUrl', 'video', 'videoUrl', 'filePath', 'src'];
    for (const k of keys) {
      if (v[k] != null) {
        const u = pickFirstUrlDeep(v[k]);
        if (u) return u;
      }
    }
    // 兜底遍历所有 value
    for (const k of Object.keys(v)) {
      if (k === 'message' || k === 'error') continue;
      const u = pickFirstUrlDeep(v[k]);
      if (u) return u;
    }
  }
  return null;
}

/**
 * 执行文字生成语音工作流，返回音频 URL。
 * end 节点 output.result = tts 节点 audio 对象（{success, message, data:{httpPath/fileUrl/audioUrl}}）。
 * @param {string} workflowId
 * @param {{ prompt: string, model: string, voiceId?: string }} input
 * @returns {Promise<{ url: string }>}
 */
export async function generateAudio(workflowId, input) {
  const output = await runWorkflow(workflowId, input, { meta: { mode: workflowId }, returnRawEndOutput: true });
  // result 可能是对象（tts 产出）/字符串 URL；其余字段兜底
  const url = pickFirstUrlDeep(output?.result) || pickFirstUrlDeep(output) || null;
  if (!url) {
    const errMsg = (typeof output?.result === 'object' && output?.result?.message)
      || output?.error
      || '未返回音频';
    throw new Error(errMsg);
  }
  const normalized = normalizeImageUrl(url);
  // 非后端外链音频也下载到后端 data 目录，避免外链过期
  const [persisted] = await persistImagesToBackend([normalized]);
  return { url: persisted };
}

/**
 * 执行生成视频工作流，返回视频 URL。
 * end 节点 output.result = video URL 字符串 或 video 节点产出对象（{success, message, data:{video/videoUrl}}）。
 * @param {string} workflowId
 * @param {{ images?: string[], prompt: string, model: string, aspect: string, quality: string, duration: string }} input
 * @returns {Promise<{ url: string }>}
 */
export async function generateVideo(workflowId, input) {
  const output = await runWorkflow(workflowId, input, { meta: { mode: workflowId }, returnRawEndOutput: true });
  const url = pickFirstUrlDeep(output?.result) || pickFirstUrlDeep(output) || null;
  if (!url) {
    const errMsg = (typeof output?.result === 'object' && output?.result?.message)
      || output?.error
      || '未返回视频';
    throw new Error(errMsg);
  }
  const normalized = normalizeImageUrl(url);
  const [persisted] = await persistImagesToBackend([normalized]);
  return { url: persisted };
}

// ============ 视觉 Agent（agent_run + 多图）============
// 把图片 URL 压缩后转 base64 data URL（附件通道传给视觉模型 + 减小体积）。
// browser-image-compression Web Worker 压缩，大图不卡 UI；失败时降级用原图。
// 与 BBoxViewerDialog 里的实现同款，抽到此处供反推提示词等节点复用。
export async function compressImageToDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`读取图片失败(${resp.status})`);
  const blob = await resp.blob();
  const file = new File([blob], 'image', { type: blob.type || 'image/png' });
  const toDataUrl = (b) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片转 base64 失败'));
    reader.readAsDataURL(b);
  });
  try {
    const compress = await getImageCompression();
    const compressed = await compress(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    });
    return await toDataUrl(compressed);
  } catch (err) {
    console.warn('[vision-agent] 压缩失败，降级用原图:', err?.message || err);
    return await toDataUrl(blob);
  }
}

// 批量压缩多张图（并发）。每张独立压缩，失败降级原图，不阻塞其他图。
// signal.aborted 后立即短路返回（不再继续后续图），调用方据此丢弃结果。
export async function compressImagesToDataUrls(urls, { onProgress, signal } = {}) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return [];
  const results = await Promise.all(list.map((url) => compressImageToDataUrl(url).catch((err) => {
    console.error('[vision-agent] compress one image failed:', err);
    return null;
  })));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const d = results[i];
    if (d) {
      out.push(d);
    } else {
      // 个别图压缩失败，尝试不压缩直接读
      try { out.push(await compressImageToDataUrl(list[i])); } catch { /* 跳过 */ }
    }
    onProgress?.(i + 1, list.length);
  }
  return out.filter(Boolean);
}

/**
 * 去除 AI 返回文本里的 <think>…</think> 块（含未闭合的尾随 <think>… 残留）。
 * 与 server/src/agents/title-generator-agent.ts 的处理同款，供反推等需要纯产出的调用方使用。
 * 仅在外显调用方主动 opt-in 时用（stripThink=true），默认保留 AI 原始输出（含思考过程）。
 */
export function stripThinkTags(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '') // 完整闭合块
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')          // 尾随未闭合块
    .replace(/<\/think>/gi, '')                        // 残留闭合标签
    .trim();
}

/**
 * 通用并发池：最多 concurrency 个任务同时执行，按提交顺序返回结果。
 * 单个任务失败抛出 -> 抛出异常并带上失败任务的 index（含成功任务的结果在 finally 块）。
 * 任务函数 factory(i) 返回 Promise，i 为序号 0..total-1。
 *
 * 与 Promise.all 语义不同：限制并发而非无限并发；用于按 count 重复生成时
 * 防止一次性同时打 N 个工作流请求（既快又稳）。
 *
 * @param {number} total 总任务数
 * @param {number} concurrency 最大并发
 * @param {(i:number)=>Promise<any>} factory 任务工厂
 * @returns {Promise<any[]>} 按 i 排序的结果数组
 */
export async function runWithConcurrency(total, concurrency, factory) {
  const n = Math.max(0, Math.floor(total || 0));
  const cap = Math.min(Math.max(1, Math.floor(concurrency || 1)), Math.max(1, n)) || 1;
  const results = new Array(n);
  let cursor = 0;
  const workers = Array.from({ length: cap }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= n) return;
      results[i] = await factory(i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 调视觉 agent 反推图片为文本（如提示词）。
 * 内部把图片批量压缩成 base64 data URL → 调 agent_run（images 附件通道）→ 返回原始文本。
 *
 * @param {object} agentConfig { id, userPrompt }
 * @param {string[]} imageUrls 图片 URL（http / 相对路径均可，内部压缩）
 * @param {object} [opts]
 * @param {(done:number,total:number)=>void} [opts.onCompressProgress] 压缩进度回调
 * @param {AbortSignal} [opts.signal] 取消信号：透传到 callPluginTool 的 fetch，真中断 HTTP 请求
 *                                    （fetch 抛 AbortError，后端响应客户端断开）；
 *                                    压缩阶段 aborted 也会短路返回。
 * @param {boolean} [opts.stripThink=false] 是否去除返回文本里的 <think>…</think> 块（默认关闭，保留 AI 原始输出）
 * @returns {Promise<string>} AI 返回的原始文本（stripThink=true 时已去除 think 块）
 */
export async function runAgentVisionText(agentConfig, imageUrls, opts = {}) {
  const AS = window.AgentSpaces;
  if (!AS?.callPluginTool) throw new Error('宿主 callPluginTool 不可用');
  if (!agentConfig?.id) throw new Error('未配置 AI 模型');
  const signal = opts?.signal;
  const normalized = normalizeImageUrls((imageUrls || []).filter(Boolean));
  if (!normalized.length) throw new Error('没有输入图片');
  const dataUrls = await compressImagesToDataUrls(normalized, {
    onProgress: opts.onCompressProgress,
    signal,
  });
  if (!dataUrls.length) throw new Error('图片预处理失败');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const userPrompt = (agentConfig.userPrompt || '').replace(/\{imageUrl\}/g, ''); // 兼容旧模板占位符
  // signal 透传到 callPluginTool：fetch AbortController 真中断 HTTP，不再等到 AI 跑完才丢弃
  const ret = await AS.callPluginTool(
    BUILTIN_PLUGIN,
    'agent_run',
    {
      prompt: (userPrompt || '').trim(),
      agentConfigId: agentConfig.id,
      permissionMode: 'bypassPermissions',
      images: dataUrls,
    },
    signal ? { signal } : undefined,
  );
  // agent_run 返回结构：ret.result / ret.output（字符串）
  const raw = ret?.result ?? ret?.output ?? '';
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return opts?.stripThink ? stripThinkTags(text) : text;
}

/**
 * 调用提示词优化 agent（纯文本 agent_run，无图）。
 *
 * agentConfig: { id, userPrompt } —— 来自 settings.promptOptimizeAgentConfigId / promptOptimizeUserPrompt
 *   userPrompt 模板里的 {prompt} / {direction} 占位符会被替换为实际入参。
 * originalPrompt: 原始提示词
 * direction: 优化方向（自然语言）
 *
 * 返回：AI 输出的纯文本（已 stripThink）。systemPrompt 归 agent preset 自带。
 */
export async function runPromptOptimizeAgent(agentConfig, originalPrompt, direction, opts = {}) {
  const AS = window.AgentSpaces;
  if (!AS?.callPluginTool) throw new Error('宿主 callPluginTool 不可用');
  if (!agentConfig?.id) throw new Error('未配置提示词优化 AI 模型');
  const tpl = agentConfig.userPrompt || '';
  const prompt = tpl
    .replace(/\{prompt\}/g, originalPrompt || '')
    .replace(/\{direction\}/g, direction || '');
  if (!prompt.trim()) throw new Error('用户提示词模板为空');
  const signal = opts?.signal;
  const ret = await AS.callPluginTool(
    BUILTIN_PLUGIN,
    'agent_run',
    {
      prompt,
      agentConfigId: agentConfig.id,
      permissionMode: 'bypassPermissions',
    },
    signal ? { signal } : undefined,
  );
  const raw = ret?.result ?? ret?.output ?? '';
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return stripThinkTags(text);
}
