import { useCallback, useEffect, useState } from 'react';
import { assetLibraryConfigPath, onAnyConfigChanged } from '../utils/storage';

// 文件去重窗口：嵌套 dropzone（外层 Dropzone + 内层 FileUpload）会在拖拽时同时触发 onDrop，
// 导致同一文件被上传两次。按 name+size+lastModified 签名，DEDUPE_WINDOW_MS 内只处理一次。
const DEDUPE_WINDOW_MS = 2000;
const recentSignatures = new Map();
function fileSignature(f) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}
function consumeFile(f) {
  const sig = fileSignature(f);
  const now = Date.now();
  // 清理过期签名
  for (const [k, t] of recentSignatures) {
    if (now - t > DEDUPE_WINDOW_MS) recentSignatures.delete(k);
  }
  if (recentSignatures.has(sig)) return false; // 重复，跳过
  recentSignatures.set(sig, now);
  return true;
}

/**
 * 素材库：按工作区隔离到 configs/workspaces/<id>/asset-library.json。
 * 通过服务端单写者持久化，getConfig 读取 + onAnyConfigChanged 多端同步（三重读取）。
 *
 * 数据结构：{ categories: [{ id, name, createdAt, assets: [{ id, url, name, size, uploadedAt }] }] }
 *
 * @param {string} workspaceId 当前工作区 id
 * @returns {{
 *   categories: array,
 *   createCategory: (name?:string)=>Promise,
 *   renameCategory: (id:string, name:string)=>Promise,
 *   deleteCategory: (id:string)=>Promise,
 *   addAsset: (categoryId:string, asset:{url,name?,size?})=>Promise,
 *   removeAsset: (categoryId:string, assetId:string)=>Promise,
 *   uploadFiles: (categoryId:string, files:File[])=>Promise, // 上传文件并 addAsset
 *   uploadingCount: number, // 正在上传的文件数
 * }}
 */
export default function useAssetLibrary(workspaceId) {
  const [categories, setCategories] = useState([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  useEffect(() => {
    const as = window.AgentSpaces;
    const target = assetLibraryConfigPath(workspaceId);
    const apply = (value) => {
      setCategories(value && Array.isArray(value.categories) ? value.categories : []);
    };
    // 三重读取：getConfig 快照 + onConfigReady 兜底 + onAnyConfigChanged 多端同步
    apply(as?.getConfig?.(target));
    const unsubReady = as?.onConfigReady?.((configs) => apply(configs?.[target]));
    const unsub = onAnyConfigChanged((path, value) => {
      if (path !== target) return;
      apply(value);
    });
    return () => {
      try { unsub(); } catch {}
      try { unsubReady?.(); } catch {}
    };
  }, [workspaceId]);

  const createCategory = useCallback(async (name) => {
    return window.AgentSpaces?.invokeService?.('create_category', { workspaceId, name });
  }, [workspaceId]);

  const renameCategory = useCallback(async (id, name) => {
    return window.AgentSpaces?.invokeService?.('rename_category', { workspaceId, id, name });
  }, [workspaceId]);

  const deleteCategory = useCallback(async (id) => {
    return window.AgentSpaces?.invokeService?.('delete_category', { workspaceId, id });
  }, [workspaceId]);

  const addAsset = useCallback(async (categoryId, asset) => {
    return window.AgentSpaces?.invokeService?.('add_asset', {
      workspaceId,
      categoryId,
      asset,
    });
  }, [workspaceId]);

  const removeAsset = useCallback(async (categoryId, assetId) => {
    return window.AgentSpaces?.invokeService?.('remove_asset', {
      workspaceId,
      categoryId,
      assetId,
    });
  }, [workspaceId]);

  // 移动资产到另一分类（原子操作：源删除 + 目标追加，服务端按 url 去重）
  const moveAsset = useCallback(async (fromCategoryId, assetId, toCategoryId) => {
    return window.AgentSpaces?.invokeService?.('move_asset', {
      workspaceId,
      fromCategoryId,
      assetId,
      toCategoryId,
    });
  }, [workspaceId]);

  // 上传文件并 addAsset：对每个 File 调 window.AgentSpaces.uploadFile 拿 http URL，
  // 上传成功后写入对应分类。串行执行（性能足够，并发优化见 handoff 后续）。
  // 抛错不中断后续文件，单个失败仅跳过。
  // 注意：嵌套 dropzone 会在拖拽时同时触发外层 Dropzone 和内层 FileUpload，consumeFile 去重保证只上传一次。
  const uploadFiles = useCallback(async (categoryId, files) => {
    const as = window.AgentSpaces;
    if (!as?.uploadFile || !Array.isArray(files) || files.length === 0) return;
    const unique = files.filter(consumeFile);
    if (unique.length === 0) return; // 全部是近窗口内重复，跳过
    setUploadingCount((n) => n + unique.length);
    try {
      for (const file of unique) {
        try {
          const res = await as.uploadFile(file);
          const url = res?.url || res?.httpPath;
          if (!url) continue;
          await addAsset(categoryId, {
            id: `ast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            url,
            name: file.name || 'untitled',
            size: file.size || 0,
            uploadedAt: Date.now(),
          });
        } catch {
          // 单个文件失败跳过，不影响其他文件
        }
      }
    } finally {
      setUploadingCount((n) => Math.max(0, n - unique.length));
    }
  }, [workspaceId, addAsset]);

  return {
    categories,
    createCategory,
    renameCategory,
    deleteCategory,
    addAsset,
    removeAsset,
    moveAsset,
    uploadFiles,
    uploadingCount,
  };
}
