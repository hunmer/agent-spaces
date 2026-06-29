// configs 文件路径常量（供客户端 hooks 与服务端 store 共用）
// 服务端 store.js 必须只有 export default（compileService 不处理命名导出），
// 所以常量放这里，store.js 内部硬编码同名值。
export const HISTORY_PATH = 'generation-history.json';
export const CUSTOM_STYLES_PATH = 'custom-styles.json';
export const SETTINGS_PATH = 'settings.json';
