import { createElement, useEffect, useRef, useState } from 'react';
import { authHeaders, fetchWithAuth, getToken } from '@/lib/auth';
import { getActiveServerUrl } from '@/lib/server';
import { sdk } from '@/lib/sdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { newEmptyAgent, normalizeAgent, type AgentPreset } from '@/components/sidebar/agent-shared';
import { miniAppConfigToAgentPreset, agentPresetToMiniAppConfig } from './mini-app-agent-adapter';
import type { MiniAppAgentConfig } from '@agent-spaces/sdk';
import * as AgentSpacesUI from '@/lib/ui-exports';
import { useEditorStore } from '@/stores/editor';
import { getWS } from '@/lib/ws';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendNativeNotification,
} from '@/lib/native-notification';

const LAST_SELECTION_CONFIG = 'last-selection.json';
const FILE_UPLOAD_DEBUG = '[DEBUG-file-upload-20260713]';

type UploadedWorkflowFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  url: string;
  httpPath?: string;
};

type WorkflowFileUploadItem = {
  id: string;
  file: File & Partial<UploadedWorkflowFile> & {
    uploadedPath?: string;
    uploadedUrl?: string;
    uploadedHttpPath?: string;
    uploading?: boolean;
    uploadProgress?: number;
    uploadError?: string;
    uploadPromise?: Promise<UploadedWorkflowFile>;
  };
  preview?: string;
};

type MiniAppRuntimeContext = {
  route: string;
  params: Record<string, unknown>;
};

function summarizeWorkflowUploadItem(item: WorkflowFileUploadItem) {
  return {
    id: item.id,
    name: item.file?.name,
    preview: item.preview,
    uploadedPath: item.file?.uploadedPath,
    uploadedUrl: item.file?.uploadedUrl,
    uploadedHttpPath: item.file?.uploadedHttpPath,
    uploading: item.file?.uploading,
    uploadProgress: item.file?.uploadProgress,
    uploadError: item.file?.uploadError,
    hasUploadPromise: Boolean(item.file?.uploadPromise),
  };
}

function normalizeRelativePath(filePath: string, fallback: string) {
  const normalized = (filePath || fallback).trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw new Error(`Invalid file path: ${filePath}`);
  }
  return normalized;
}

function inferDownloadFileName(url: string) {
  try {
    const parsed = new URL(url, window.location.href);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : 'download.bin';
  } catch {
    return 'download.bin';
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function uploadWorkflowFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadedWorkflowFile> {
  const formData = new FormData();
  formData.append('file', file);
  onProgress?.(0);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const baseUrl = getActiveServerUrl();
    xhr.open('POST', `${baseUrl || ''}/api/upload`);
    for (const [key, value] of Object.entries(authHeaders() as Record<string, string>)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.((event.loaded / event.total) * 100);
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onload = () => {
      const payload = parseUploadResponse(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(payload?.error || `Failed to upload file: ${xhr.status} ${xhr.statusText}`));
        return;
      }
      onProgress?.(100);
      resolve(payload as UploadedWorkflowFile);
    };
    xhr.send(formData);
  });
}

function parseUploadResponse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createWorkflowUploadFile(file: File, uploadPromise: Promise<UploadedWorkflowFile>) {
  return Object.assign(file, {
    uploading: true,
    uploadProgress: 0,
    uploadPromise,
  });
}

function mergeUploadedFile(file: WorkflowFileUploadItem['file'], uploaded: UploadedWorkflowFile) {
  return Object.assign(file, {
    uploadedPath: uploaded.path,
    uploadedUrl: uploaded.url,
    uploadedHttpPath: uploaded.httpPath,
    uploading: false,
    uploadProgress: 100,
    uploadError: undefined,
    uploadPromise: Promise.resolve(uploaded),
  });
}

function markUploadFailed(file: WorkflowFileUploadItem['file'], error: unknown) {
  return Object.assign(file, {
    uploading: false,
    uploadProgress: 0,
    uploadError: error instanceof Error ? error.message : String(error || 'Upload failed'),
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.bin';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function WrappedFileUpload(props: any) {
  const latestValueRef = useRef<WorkflowFileUploadItem[]>(props.value || []);
  const autoUpload = props.autoUpload === true;

  const emitUploadStatus = (files = latestValueRef.current) => {
    props.onUploadStatusChange?.({
      uploading: files.some((item: WorkflowFileUploadItem) => item.file?.uploading),
      files,
    });
  };

  const setUploadProgress = (itemId: string, progress: number) => {
    const current = latestValueRef.current;
    const updated = current.map((currentItem) => (
      currentItem.id === itemId
        ? { ...currentItem, file: Object.assign(currentItem.file, { uploading: progress < 100, uploadProgress: progress }) }
        : currentItem
    ));
    latestValueRef.current = updated;
    props.onChange?.(updated);
    emitUploadStatus(updated);
  };

  useEffect(() => {
    latestValueRef.current = props.value || [];
    console.info(FILE_UPLOAD_DEBUG, 'wrapper props.value changed', latestValueRef.current.map(summarizeWorkflowUploadItem));
    emitUploadStatus(latestValueRef.current);
  }, [props.value]);

  const handleChange = (files: WorkflowFileUploadItem[]) => {
    console.info(FILE_UPLOAD_DEBUG, 'wrapper handleChange', {
      autoUpload,
      files: files.map(summarizeWorkflowUploadItem),
    });
    if (!autoUpload) {
      latestValueRef.current = files;
      props.onChange?.(files);
      emitUploadStatus(files);
      return;
    }

    const next = files.map((item) => {
      const file = item.file;
      if (!file || file.uploadedPath || file.uploadedHttpPath || file.uploadPromise || !(file instanceof File)) {
        return item;
      }

      const uploadPromise = uploadWorkflowFile(file, (progress) => setUploadProgress(item.id, progress));
      return {
        ...item,
        file: createWorkflowUploadFile(file, uploadPromise),
      };
    });

    latestValueRef.current = next;
    props.onChange?.(next);
    emitUploadStatus(next);

    for (const item of next) {
      const promise = item.file?.uploadPromise;
      if (!promise || !item.file.uploading) continue;

      promise
        .then((uploaded) => {
          console.info(FILE_UPLOAD_DEBUG, 'upload request succeeded', {
            itemId: item.id,
            response: {
              name: uploaded.name,
              path: uploaded.path,
              url: uploaded.url,
              httpPath: uploaded.httpPath,
            },
          });
          const current = latestValueRef.current;
          const updated = current.map((currentItem) => (
            currentItem.id === item.id
              ? { ...currentItem, file: mergeUploadedFile(currentItem.file, uploaded) }
              : currentItem
          ));
          latestValueRef.current = updated;
          console.info(FILE_UPLOAD_DEBUG, 'wrapper success state', updated.map(summarizeWorkflowUploadItem));
          props.onChange?.(updated);
          emitUploadStatus(updated);
        })
        .catch((error) => {
          console.error(FILE_UPLOAD_DEBUG, 'upload request failed', { itemId: item.id, error });
          const current = latestValueRef.current;
          const updated = current.map((currentItem) => (
            currentItem.id === item.id
              ? { ...currentItem, file: markUploadFailed(currentItem.file, error) }
              : currentItem
          ));
          latestValueRef.current = updated;
          props.onChange?.(updated);
          emitUploadStatus(updated);
        });
    }
  };

  return createElement(AgentSpacesUI.FileUpload as any, {
    ...props,
    autoUpload: undefined,
    onChange: handleChange,
  });
}

/**
 * Mount `window.AgentSpacesUI`, `window.AgentSpaces`, `window.AgentSpacesAPI`
 * for mini-app preview code. Cleans up on unmount.
 */
export function useMiniAppHostApi(projectId: string, runtimeContext?: MiniAppRuntimeContext) {
  const executorIdRef = useRef<string>('');
  const runtimeContextRef = useRef<MiniAppRuntimeContext>(runtimeContext ?? { route: '/', params: {} });
  const configCacheRef = useRef<Map<string, unknown>>(new Map());
  const configReadyRef = useRef(false);
  const configChangeCallbacksRef = useRef<Set<(path: string, value: unknown) => void>>(new Set());
  const configReadyCallbacksRef = useRef<Set<(configs: Record<string, unknown>) => void>>(new Set());

  useEffect(() => {
    runtimeContextRef.current = runtimeContext ?? { route: '/', params: {} };
  }, [runtimeContext]);

  // —— Agent editor 弹窗：mini-app 通过 openAgentEditor 配置 AI 模型 ——
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAgent, setEditorAgent] = useState<AgentPreset | null>(null);
  const [editorOriginalConfig, setEditorOriginalConfig] = useState<MiniAppAgentConfig | null>(null);
  const [editorMigratedGlobalAgentId, setEditorMigratedGlobalAgentId] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const editorResolverRef = useRef<((v: AgentPreset | null) => void) | null>(null);

  const closeEditor = (result: AgentPreset | null) => {
    setEditorOpen(false);
    editorResolverRef.current?.(result);
    editorResolverRef.current = null;
  };

  useEffect(() => {
    const encodedProjectId = encodeURIComponent(projectId);
    configCacheRef.current = new Map();
    configReadyRef.current = false;
    configReadyCallbacksRef.current.clear();
    const configChangeCallbacks = configChangeCallbacksRef.current;
    const configReadyCallbacks = configReadyCallbacksRef.current;

    if (!executorIdRef.current) {
      // sessionStorage 标签级持久：同标签刷新/重连 executorId 不变，
      // 可认领自己之前发起的 running 任务；不同标签各自独立。
      const STORAGE_KEY = 'as-wfui-executor-id';
      let id = '';
      try { id = sessionStorage.getItem(STORAGE_KEY) || ''; } catch { /* noop */ }
      if (!id) {
        const g = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
        id = g?.randomUUID?.()
          ?? `exec-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
        try { sessionStorage.setItem(STORAGE_KEY, id); } catch { /* noop */ }
      }
      executorIdRef.current = id;
    }
    const executorId = executorIdRef.current;

    const executePluginTool = async (
      pluginId: string,
      toolName: string,
      args: Record<string, any>,
      options?: { taskId?: string; meta?: Record<string, unknown> },
    ) => {
      const body: Record<string, unknown> = { name: toolName, args, workspaceId: projectId, executorId };
      if (options?.taskId) body.taskId = options.taskId;
      if (options?.meta) body.meta = options.meta;
      const resp = await fetchWithAuth(`/api/plugins/${encodeURIComponent(pluginId)}/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await resp.json();
      if (!resp.ok) return payload;
      return Object.prototype.hasOwnProperty.call(payload, 'result') ? payload.result : payload;
    };

    // Workflow UI 任务事件订阅：转发所有 miniApp.* WS 事件给沙箱项目代码。
    // 用通配符订阅 + 前缀过滤，避免每加一个自定义事件就改白名单
    // （例如 agent api.js broadcast 的 miniApp.setForm / miniApp.playerAction 等）。
    const subscribeTaskEvents = (cb: (event: string, data: any) => void) => {
      const ws = getWS(projectId);
      const off = ws.on('*', (payload: any) => {
        const event = payload?.event;
        if (typeof event === 'string' && event.startsWith('miniApp.')) {
          cb(event, payload.data);
        }
      });
      return () => { try { off(); } catch { /* noop */ } };
    };

    // ---- Config: 服务端为唯一写入方，UI 仅维护内存缓存 + 订阅变更 ----
    const emitConfigChange = (path: string, value: unknown) => {
      configCacheRef.current.set(path, value);
      for (const cb of configChangeCallbacks) {
        try { cb(path, value); } catch { /* noop */ }
      }
    };
    const emitConfigReady = () => {
      configReadyRef.current = true;
      const configs = Object.fromEntries(configCacheRef.current);
      for (const cb of configReadyCallbacks) {
        try { cb(configs); } catch { /* noop */ }
      }
      configReadyCallbacks.clear();
    };
    const offConfigSnapshot = getWS(projectId).on('miniApp.configSnapshot', (data: any) => {
      const configs = (data?.configs ?? {}) as Record<string, unknown>;
      configCacheRef.current = new Map(Object.entries(configs));
      for (const [path, value] of Object.entries(configs)) emitConfigChange(path, value);
      emitConfigReady();
    });
    const offConfigChanged = getWS(projectId).on('miniApp.configChanged', (data: any) => {
      if (data?.path) emitConfigChange(data.path, data.value);
    });

    const getConfig = (path: string): unknown => {
      const v = configCacheRef.current.get(path);
      return v === undefined ? null : v;
    };
    const getAllConfigs = (): Record<string, unknown> => Object.fromEntries(configCacheRef.current);
    const isConfigReady = (): boolean => configReadyRef.current;
    const onConfigChanged = (cb: (path: string, value: unknown) => void) => {
      configChangeCallbacks.add(cb);
      return () => { configChangeCallbacks.delete(cb); };
    };
    const onConfigReady = (cb: (configs: Record<string, unknown>) => void) => {
      if (configReadyRef.current) {
        cb(Object.fromEntries(configCacheRef.current));
        return () => {};
      }
      configReadyCallbacks.add(cb);
      return () => { configReadyCallbacks.delete(cb); };
    };

    const respondClientRequest = (requestId: string, result: unknown, ok = true, error?: string) => {
      getWS(projectId).send('miniApp.clientResponse', { requestId, ok, result, error });
    };

    // ---- Services RPC: 调用项目 src/services/*.js 里的 handler（服务端执行） ----
    const invokeService = async (name: string, payload?: unknown) => {
      const resp = await fetchWithAuth(`/api/mini-apps/${encodedProjectId}/services/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, payload }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `service invoke failed: ${resp.status}`);
      return data?.result;
    };

    const readConfigJson = async <T,>(filePath = LAST_SELECTION_CONFIG): Promise<T | null> => {
      const path = normalizeRelativePath(filePath, LAST_SELECTION_CONFIG);
      const resp = await fetchWithAuth(`/api/mini-apps/${encodedProjectId}/configs/content?path=${encodeURIComponent(path)}`);
      if (!resp.ok) throw new Error(`Failed to read config: ${resp.status} ${resp.statusText}`);
      const { value } = await resp.json();
      return value;
    };

    const writeConfigJson = async (filePath: string, value: unknown) => {
      const path = normalizeRelativePath(filePath, LAST_SELECTION_CONFIG);
      const resp = await fetchWithAuth(`/api/mini-apps/${encodedProjectId}/configs/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value }),
      });
      if (!resp.ok) throw new Error(`Failed to write config: ${resp.status} ${resp.statusText}`);
      return { ok: true, path: `configs/${path}` };
    };

    const readLastSelection = <T,>() => readConfigJson<T>(LAST_SELECTION_CONFIG);
    const writeLastSelection = (value: unknown) => writeConfigJson(LAST_SELECTION_CONFIG, value);

    const saveDataFile = async (filePath: string, content: string | Blob | ArrayBuffer | Uint8Array) => {
      const path = normalizeRelativePath(filePath, 'download.bin');
      if (typeof content === 'string') {
        const resp = await fetchWithAuth(`/api/mini-apps/${encodedProjectId}/data/content`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content }),
        });
        if (!resp.ok) throw new Error(`Failed to save data file: ${resp.status} ${resp.statusText}`);
        return resp.json();
      }

      const blob = content instanceof Blob ? content : new Blob([content as BlobPart]);
      const base64 = await blobToBase64(blob);
      const resp = await fetchWithAuth(`/api/mini-apps/${encodedProjectId}/data/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: base64, encoding: 'base64' }),
      });
      if (!resp.ok) throw new Error(`Failed to save data file: ${resp.status} ${resp.statusText}`);
      return resp.json();
    };

    const downloadFile = async (url: string, filePath?: string, init?: RequestInit) => {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      const path = normalizeRelativePath(filePath ?? inferDownloadFileName(url), 'download.bin');
      const base64 = await blobToBase64(await response.blob());
      const resp = await fetchWithAuth(`/api/mini-apps/${encodedProjectId}/data/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: base64, encoding: 'base64' }),
      });
      if (!resp.ok) throw new Error(`Failed to save downloaded file: ${resp.status} ${resp.statusText}`);
      return resp.json();
    };

    const downloadZip = async (
      files: Array<{ url: string; filename?: string; init?: RequestInit }>,
      zipFilename = 'download.zip',
    ) => {
      const validFiles = Array.isArray(files) ? files.filter((file) => file?.url) : [];
      if (!validFiles.length) throw new Error('No files to zip');

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]!;
        const response = await fetch(file.url, file.init);
        if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        const filename = normalizeRelativePath(
          file.filename || inferDownloadFileName(file.url),
          `${String(i + 1).padStart(2, '0')}.bin`,
        );
        zip.file(filename, await response.blob());
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(blob, zipFilename || 'download.zip');
      return { ok: true, count: validFiles.length, filename: zipFilename || 'download.zip' };
    };

    // ---- SQLite db (per-project named databases under data/db/) ----
    const DB_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
    const createDbHandle = (dbName: string) => {
      if (!DB_NAME_RE.test(dbName)) {
        throw new Error(`Invalid db name: ${dbName}`);
      }
      const base = `/api/mini-apps/${encodedProjectId}/db/${encodeURIComponent(dbName)}`;
      const post = async <T,>(url: string, body: unknown): Promise<T> => {
        const resp = await fetchWithAuth(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await resp.json();
        if (!resp.ok || payload?.ok === false) {
          throw new Error(payload?.error?.message || `db request failed: ${resp.status} ${resp.statusText}`);
        }
        return payload as T;
      };
      return {
        all: (sql: string, params?: unknown[] | Record<string, unknown>) =>
          post<{ result: unknown[] }>(base, { sql, params, mode: 'all' }).then((p) => p.result),
        get: (sql: string, params?: unknown[] | Record<string, unknown>) =>
          post<{ result: unknown }>(base, { sql, params, mode: 'get' }).then((p) => p.result),
        run: (sql: string, params?: unknown[] | Record<string, unknown>) =>
          post<{ result: { changes: number; lastInsertRowid: number | bigint } }>(base, { sql, params, mode: 'run' }).then((p) => p.result),
        exec: (sql: string) =>
          post<{ result: unknown }>(base, { sql, mode: 'exec' }).then(() => undefined),
        transaction: (statements: { sql: string; params?: unknown[] | Record<string, unknown> }[]) =>
          post(`${base}/transaction`, { statements }).then(() => undefined),
      };
    };
    const dbApi = (name: string) => createDbHandle(name);

    const uploadFile = async (file: File) => uploadWorkflowFile(file);

    // ---- Plugin info ----
    const getPluginInfo = async (pluginId: string) => {
      const resp = await fetchWithAuth(`/api/plugins`);
      if (!resp.ok) throw new Error(`Failed to list plugins: ${resp.status}`);
      const plugins: any[] = await resp.json();
      return plugins.find((p: any) => p.id === pluginId) ?? null;
    };

    // ---- Tool exists check ----
    const toolExists = async (pluginId: string, toolName: string): Promise<boolean> => {
      const resp = await fetchWithAuth(`/api/plugins/${encodeURIComponent(pluginId)}/tools`);
      if (!resp.ok) return false;
      const tools: Array<{ name: string }> = await resp.json();
      return tools.some((t) => t.name === toolName);
    };

    // ---- Open file in editor ----
    const openFile = async (filePath: string, line?: number, column?: number) => {
      window.dispatchEvent(new CustomEvent('agent-spaces:open-file', {
        detail: { workspaceId: projectId, path: filePath, line, column },
      }));
    };

    // ---- Reveal folder in file manager ----
    const revealFolder = async (folderPath?: string) => {
      const query = folderPath ? `?path=${encodeURIComponent(folderPath)}` : '';
      const resp = await fetchWithAuth(`/api/workspaces/${projectId}/files/reveal${query}`, {
        method: 'POST',
      });
      if (!resp.ok) throw new Error(`Failed to reveal folder: ${resp.status}`);
      return resp.json();
    };

    // ---- User settings (localStorage only, per-project, key: workflow_setting_<projectId>) ----
    // 与服务端 config 不同：这是纯本地、按客户端保存的用户偏好（如通知开关），不跨端同步。
    const SETTING_STORAGE_KEY = `workflow_setting_${projectId}`;
    const loadUserSettings = (): Record<string, unknown> => {
      try {
        const raw = localStorage.getItem(SETTING_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    };
    const persistUserSettings = (settings: Record<string, unknown>) => {
      try {
        localStorage.setItem(SETTING_STORAGE_KEY, JSON.stringify(settings));
      } catch {
        /* quota exceeded / private mode — ignore */
      }
    };
    // getUserSetting(k)              -> settings[k] ?? undefined
    // getUserSetting(k, def)         -> settings[k] ?? def
    // getUserSetting(k, subKey, def) -> settings[k][subKey] ?? def
    const getUserSetting = (k: string, ...rest: unknown[]): unknown => {
      const settings = loadUserSettings();
      if (rest.length === 0) {
        return Object.prototype.hasOwnProperty.call(settings, k) ? settings[k] : undefined;
      }
      if (rest.length === 1) {
        return Object.prototype.hasOwnProperty.call(settings, k) ? settings[k] : rest[0];
      }
      const subKey = rest[0];
      const def = rest[1];
      const sub = settings[k];
      return sub && typeof sub === 'object' && !Array.isArray(sub)
          && Object.prototype.hasOwnProperty.call(sub, subKey as PropertyKey)
        ? (sub as Record<string, unknown>)[subKey as string]
        : def;
    };
    // setUserSetting(k, value)           -> settings[k] = value
    // setUserSetting(k, subKey, value)   -> settings[k] = { ...settings[k], [subKey]: value }
    const setUserSetting = (k: string, ...rest: unknown[]): void => {
      const settings = loadUserSettings();
      if (rest.length < 2) {
        settings[k] = rest[0];
      } else {
        const subKey = rest[0] as string;
        const value = rest[1];
        const prev = settings[k] && typeof settings[k] === 'object' && !Array.isArray(settings[k])
          ? (settings[k] as Record<string, unknown>)
          : {};
        settings[k] = { ...prev, [subKey]: value };
      }
      persistUserSettings(settings);
    };
    // 批量浅合并写入
    const saveUserSettings = (obj: Record<string, unknown>): Record<string, unknown> => {
      const settings = { ...loadUserSettings(), ...(obj || {}) };
      persistUserSettings(settings);
      return settings;
    };

    // ---- Send notification (server-side notification center via REST) ----
    const sendNotification = async (type: string, title: string, description?: string, data?: Record<string, unknown>) => {
      const resp = await fetchWithAuth(`/api/workspaces/${projectId}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, description, data }),
      });
      if (!resp.ok) throw new Error(`Failed to send notification: ${resp.status}`);
      return resp.json();
    };

    // ---- Native desktop notification (browser Notification API / Flutter bridge) ----
    // 首次调用自动请求权限；权限被拒绝/不支持时返回 { ok: false, reason }，不抛错。
    const sendNotifiction = async (
      title: string,
      body?: string,
      options?: { id?: number; ongoing?: boolean },
    ): Promise<{ ok: boolean; reason?: string }> => {
      try {
        let status = await getNotificationPermission();
        if (status !== 'granted') {
          status = await requestNotificationPermission();
        }
        if (status !== 'granted') {
          return { ok: false, reason: status };
        }
        await sendNativeNotification(title, body || '', options || {});
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) };
      }
    };

    const hostUi = {
      ...AgentSpacesUI,
      FileUpload: WrappedFileUpload,
      readConfigJson,
      writeConfigJson,
      readLastSelection,
      writeLastSelection,
      uploadFile,
      saveDataFile,
      downloadFile,
    };

    const settingApi = {
      getUserSetting,
      setUserSetting,
      saveUserSettings,
    };

    // 打开 Agent 配置弹窗：mini-app 用于配置 AI 模型（model/apiKey/systemPrompt）。
    // agentId 存在则拉完整 preset 进入编辑模式；否则用空 draft，可被 initialName/initialPrompt 覆盖。
    // 返回 Promise<AgentPreset | null>：保存返回 saved（含真实 id，可用于 agent_run），取消返回 null。
    const openAgentEditor = async (opts?: {
      initialName?: string;
      initialPrompt?: string;
      agentId?: string;
    }): Promise<AgentPreset | null> => {
      let agent: AgentPreset;
      let originalConfig: MiniAppAgentConfig | null = null;
      let migratedGlobalAgentId: string | null = null;
      if (opts?.agentId) {
        try {
          originalConfig = await sdk.miniApp.getAgent(projectId, opts.agentId);
          agent = miniAppConfigToAgentPreset(originalConfig);
        } catch {
          try {
            const globalAgent = normalizeAgent(await sdk.agent.getPreset(opts.agentId));
            globalAgent.id = opts.agentId;
            migratedGlobalAgentId = opts.agentId;
            originalConfig = agentPresetToMiniAppConfig(globalAgent, { id: globalAgent.id, name: globalAgent.name });
            agent = miniAppConfigToAgentPreset(originalConfig);
          } catch {
            const fallback = newEmptyAgent();
            fallback.id = opts.agentId;
            originalConfig = agentPresetToMiniAppConfig(fallback, { id: fallback.id, name: fallback.name });
            agent = miniAppConfigToAgentPreset(originalConfig);
          }
        }
      } else {
        agent = newEmptyAgent();
        agent.id = createMiniAppAgentId(opts?.initialName);
        originalConfig = agentPresetToMiniAppConfig(agent, { id: agent.id, name: agent.name });
      }
      if (opts?.initialName) agent.name = opts.initialName;
      if (opts?.initialPrompt) agent.systemPrompt = opts.initialPrompt;
      originalConfig = agentPresetToMiniAppConfig(agent, originalConfig);
      setEditorAgent(agent);
      setEditorOriginalConfig(originalConfig);
      setEditorMigratedGlobalAgentId(migratedGlobalAgentId);
      setEditorKey((k) => k + 1);
      setEditorOpen(true);
      return new Promise<AgentPreset | null>((resolve) => {
        editorResolverRef.current = resolve;
      });
    };

    // 把任意本地绝对路径转成可直接用于 <img>/<video> src 的 HTTP URL。
    // 用于访问本地资源库文件（如 Eagle 缩略图/原图），浏览器无法直接读 file://。
    // 鉴权通过 query token（见 middleware/auth.ts 与 routes/mini-apps.ts 的 local-file）。
    const localFileUrl = (absPath: string, opts?: { download?: boolean }): string => {
      const baseUrl = getActiveServerUrl();
      const token = getToken() || '';
      const params = new URLSearchParams();
      params.set('path', absPath);
      params.set('token', token);
      if (opts?.download) params.set('download', 'true');
      return `${baseUrl || ''}/api/mini-apps/${encodedProjectId}/local-file?${params.toString()}`;
    };

    const pluginApi = {
      callPluginTool: executePluginTool,
      executePluginTool,
      getPluginInfo,
      toolExists,
      subscribeTaskEvents,
      onTaskEvent: subscribeTaskEvents,
      respondClientRequest,
      getExecutorId: () => executorIdRef.current,
      getConfig,
      getAllConfigs,
      isConfigReady,
      onConfigChanged,
      onConfigReady,
      invokeService,
      openAgentEditor,
      localFileUrl,
      getRuntimeContext: () => runtimeContextRef.current,
    };

    const fileApi = {
      openFile,
      revealFolder,
    };

    const notificationApi = {
      sendNotification,
      sendNotifiction,
    };

    // 复制文本到剪贴板：兼容非安全上下文（HTTP）下 navigator.clipboard 为 undefined 的情况，
    // 优先使用 Clipboard API，失败降级到 document.execCommand('copy')。
    const copyText = async (text: string): Promise<void> => {
      const value = text || '';
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          return;
        } catch {
          // 降级到 execCommand
        }
      }
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    };

    (window as any).AgentSpacesUI = hostUi;
    (window as any).AgentSpaces = {
      ...pluginApi,
      db: dbApi,
      ...fileApi,
      ...notificationApi,
      ...settingApi,
      copyText,
      readConfigJson,
      writeConfigJson,
      readLastSelection,
      writeLastSelection,
      uploadFile,
      saveDataFile,
      downloadFile,
      downloadZip,
    };
    (window as any).AgentSpacesAPI = {
      ...pluginApi,
      db: dbApi,
      ...fileApi,
      ...notificationApi,
      ...settingApi,
      copyText,
      readConfigJson,
      writeConfigJson,
      readLastSelection,
      writeLastSelection,
      uploadFile,
      saveDataFile,
      downloadFile,
      downloadZip,
    };

    const handleOpenFile = (e: Event) => {
      const { workspaceId, path, line, column } = (e as CustomEvent).detail;
      const openFile = useEditorStore.getState().openFile;
      openFile(workspaceId, path).then(() => {
        // Scroll to line if specified (dispatched after content loads)
        if (line != null) {
          window.dispatchEvent(new CustomEvent('agent-spaces:scroll-to-line', {
            detail: { path, line, column },
          }));
        }
      });
    };
    window.addEventListener('agent-spaces:open-file', handleOpenFile);

    return () => {
      configCacheRef.current = new Map();
      configReadyRef.current = false;
      configReadyCallbacks.clear();
      offConfigSnapshot();
      offConfigChanged();
      configChangeCallbacks.clear();
      configCacheRef.current = new Map();
      window.removeEventListener('agent-spaces:open-file', handleOpenFile);
      delete (window as any).AgentSpacesUI;
      delete (window as any).AgentSpaces;
      delete (window as any).AgentSpacesAPI;
    };
  }, [projectId]);

  return editorAgent ? (
    <Dialog open={editorOpen} onOpenChange={(o) => { if (!o) closeEditor(null); }}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] max-h-[85vh] gap-0 p-0 overflow-hidden flex flex-col">
        <AgentEditor
          key={editorKey}
          agent={editorAgent}
          onSaved={(saved) => closeEditor(saved)}
          onBack={() => closeEditor(null)}
          fixedValues={{ hideInAgentList: true }}
          commit={async (draft) => {
            const original = editorOriginalConfig ?? agentPresetToMiniAppConfig(draft, { id: draft.id, name: draft.name });
            const config = agentPresetToMiniAppConfig(draft, original);
            const saved = await sdk.miniApp.updateAgent(projectId, config.id, config);
            if (editorMigratedGlobalAgentId) {
              await sdk.agent.updatePreset(editorMigratedGlobalAgentId, { hideInAgentList: true });
            }
            return miniAppConfigToAgentPreset(saved);
          }}
        />
      </DialogContent>
    </Dialog>
  ) : null;
}

function createMiniAppAgentId(name?: string): string {
  const base = (name || 'mini-app-agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'mini-app-agent';
  const g = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  const suffix = g?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${base}-${suffix}`;
}
