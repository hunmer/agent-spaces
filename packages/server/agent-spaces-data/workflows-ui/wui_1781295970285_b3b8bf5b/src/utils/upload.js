const DEFAULT_UPLOAD_SETTINGS = {
  provider: 'tencent',
  autoUpload: true,
};

export async function readUploadSettings() {
  try {
    const saved = await window.AgentSpacesUI.readConfigJson('upload-settings.json');
    return { ...DEFAULT_UPLOAD_SETTINGS, ...(saved || {}) };
  } catch (error) {
    console.warn('读取上传设置失败，使用默认设置:', error);
    return DEFAULT_UPLOAD_SETTINGS;
  }
}

export async function uploadToCloud(filePath, provider = DEFAULT_UPLOAD_SETTINGS.provider, fileName = '') {
  if (!filePath) throw new Error('缺少本地文件路径，无法上传到云存储');

  if (provider === 'aliyun') {
    const result = await window.AgentSpaces.callPluginTool('workflow.aliyun-oss', 'oss_upload_file', { filePath });
    return readUploadUrl(result, ['url']);
  }

  const key = createObjectKey(fileName || filePath);
  const args = { key, filePath };

  let result = await window.AgentSpaces.callPluginTool('workflow.tencent-cos', 'cos_upload_file', args);
  if (result?.success === false && String(result.message || '').includes('Unknown tool')) {
    result = await window.AgentSpaces.callPluginTool('workflow.tencent-cos', 'cos_upload', args);
  }

  return readUploadUrl(result, ['url', 'Location']);
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

