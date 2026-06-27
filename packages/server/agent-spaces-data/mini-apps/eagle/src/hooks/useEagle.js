// Eagle 插件调用封装
// 统一通过 window.AgentSpaces.callPluginTool 调用 workflow.eagle，
// 并把 { success, result } 响应解包到 result（即各 action 的 run 返回值）。
// 注意：插件配置里的 timeout 可能被序列化成字符串，而 fetchJson/postJson 要求 number，
// 这里统一强制注入 number 类型的 timeout，避免 "must be of type number" 报错。
const PLUGIN_ID = "workflow.eagle";
const TIMEOUT = 60000;

async function call(toolName, args) {
  const response = await window.AgentSpaces.callPluginTool(PLUGIN_ID, toolName, {
    timeout: TIMEOUT,
    ...(args || {}),
  });
  // execute 路由固定返回 { success: true, result }
  // result 内是 action run 返回的 { success, message, data }
  const payload =
    response && typeof response === "object" && "result" in response
      ? response.result
      : response;
  if (payload && payload.success === false) {
    throw new Error(payload.message || "Eagle 调用失败");
  }
  return payload;
}

function ensureArray(v) {
  if (Array.isArray(v)) return v;
  return v == null ? [] : [v];
}

export function useEagle() {
  return {
    // 探活 + 当前库信息
    appInfo: () => call("eagle_app_info", {}),
    libraryInfo: () => call("eagle_library_info", {}),

    // 文件夹
    listFolders: ({ id } = {}) => call("eagle_folder_list", id ? { id } : {}),
    createFolder: ({ name, parent, description }) =>
      call("eagle_folder_create", { name, parent, description }),
    renameFolder: ({ id, name }) => call("eagle_folder_update", { id, name }),

    // 素材
    listItems: ({ folderId, limit = 200, offset = 0 } = {}) =>
      call("eagle_item_list", {
        ...(folderId ? { folders: [folderId] } : {}),
        limit,
        offset,
      }),
    addItem: ({ url, base64, name, folderId, tags }) => {
      const body = { name, annotation: "" };
      if (url) body.url = url;
      else if (base64) body.base64 = base64;
      if (folderId) body.folders = ensureArray(folderId);
      const tagArr = ensureArray(tags);
      if (tagArr.length) body.tags = tagArr;
      return call("eagle_item_add", body);
    },
    removeItem: ({ id }) => call("eagle_item_update", { id, isDeleted: true }),
  };
}
