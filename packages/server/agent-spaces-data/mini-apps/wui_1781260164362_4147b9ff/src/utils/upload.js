// 云存储上传：支持阿里云 OSS / 腾讯云 COS 切换。
// provider 存于 configs/upload-settings.json（由 UploadSettingsDialog 写入）。
//
// 阿里云：workflow.aliyun-oss / oss_upload_file → data.url
// 腾讯云：workflow.tencent-cos / cos_upload_file（fallback cos_upload）→ data.url || data.Location

const UPLOAD_SETTINGS_PATH = 'upload-settings.json';
const DEFAULT_PROVIDER = 'aliyun'; // 文案库默认阿里云（与 ASR 同生态）

export async function readUploadSettings() {
  try {
    const saved = await window.AgentSpacesUI.readConfigJson(UPLOAD_SETTINGS_PATH);
    return { provider: DEFAULT_PROVIDER, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { provider: DEFAULT_PROVIDER };
  }
}

export async function writeUploadSettings(settings) {
  await window.AgentSpacesUI.writeConfigJson(UPLOAD_SETTINGS_PATH, settings);
}

// 本地 path → 公网 url（按 provider 分发）
export async function uploadToCloud(filePath, provider = DEFAULT_PROVIDER, fileName = '') {
  if (!filePath) throw new Error('缺少本地文件路径，无法上传到云存储');

  if (provider === 'tencent') {
    const key = createObjectKey(fileName || filePath);
    const args = { key, filePath };
    let result = await window.AgentSpaces.callPluginTool('workflow.tencent-cos', 'cos_upload_file', args);
    // 老版本插件工具名兼容
    if (result?.success === false && String(result.message || '').includes('Unknown tool')) {
      result = await window.AgentSpaces.callPluginTool('workflow.tencent-cos', 'cos_upload', args);
    }
    return readUploadUrl(result, ['url', 'Location']);
  }

  // aliyun
  const result = await window.AgentSpaces.callPluginTool('workflow.aliyun-oss', 'oss_upload_file', { filePath });
  return readUploadUrl(result, ['url']);
}

function readUploadUrl(result, fields) {
  if (!result) throw new Error('云存储上传返回为空');
  if (result.success === false) throw new Error(result.message || '云存储上传失败');
  if (result.error) throw new Error(result.error);
  const data = result.data || result;
  for (const field of fields) {
    if (data?.[field]) return data[field];
  }
  throw new Error('云存储上传成功但未返回公网 URL');
}

function createObjectKey(name) {
  const date = new Date().toISOString().slice(0, 10);
  const id = createId();
  const ext = getExt(name);
  return `uploads/${date}/${id}${ext}`;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

function getExt(name) {
  const clean = String(name || '').split(/[\\/]/).pop() || '';
  const match = clean.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : '.bin';
}
