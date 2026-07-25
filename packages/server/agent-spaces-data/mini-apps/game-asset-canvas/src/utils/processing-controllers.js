/**
 * 图像处理任务的 AbortController 注册表（模块级单例）。
 *
 * 从 Canvas.jsx 抽出。nodeId -> AbortController 映射，
 * 用于取消正在进行的本地处理（handleProcessLocal/handleCutout/handlePromptReverse）。
 *
 * 不进节点 data（AbortController 不可序列化），仅运行时取消信号。
 * 跨多个 hook 共享（useNodeExecutions 内的多个 handler）。
 */

const processingControllers = new Map();

/**
 * 注册一个节点的处理 controller（覆盖同节点旧 controller）。
 * @param {string} nodeId
 * @param {AbortController} controller
 */
export function registerController(nodeId, controller) {
  processingControllers.get(nodeId)?.abort();
  processingControllers.set(nodeId, controller);
}

/**
 * 中止某节点的处理任务。
 * @param {string} nodeId
 */
export function abortController(nodeId) {
  const controller = processingControllers.get(nodeId);
  if (controller) {
    controller.abort();
    processingControllers.delete(nodeId);
  }
}

/**
 * 清理某节点的 controller（仅在它未被取消覆盖时清理，避免误删新任务）。
 * @param {string} nodeId
 * @param {AbortController} controller 期望的 controller 引用
 */
export function clearController(nodeId, controller) {
  if (processingControllers.get(nodeId) === controller) {
    processingControllers.delete(nodeId);
  }
}

/**
 * 读取某节点的 controller（用于检查 aborted 状态）。
 * @param {string} nodeId
 * @returns {AbortController|undefined}
 */
export function getController(nodeId) {
  return processingControllers.get(nodeId);
}
