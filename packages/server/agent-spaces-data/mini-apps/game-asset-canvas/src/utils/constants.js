// 工作流 ID
export const WORKFLOWS = {
  // 文字生成图片
  text_to_image: 'd88dcb7c-7f5f-47c8-962c-89217a2c0ad6',
  // 编辑图片
  edit_image: '19f5f8a9-305d-43a6-9b05-584597213a8f',
};

// 节点类型
export const NODE_TYPES = {
  textToImage: 'textToImage',
  editImage: 'editImage',
  imageDisplay: 'imageDisplay',
  note: 'note',
};

// 工作流内置插件
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';
export const EXEC_TOOL = 'execute_workflow_sync';

// 模型下拉选项：工作流 run_code 路由关键字（已补全）
// 含 'gpt'/'dall-e'/'flux'/'nano' -> case-3 AI图片文生图
// 含 'jimeng' -> case-2 即梦AI文生图
// 含 'qwen'/'wanx'/'wan2.7' -> case-1 阿里云AI文生图
// 含 'kling' -> case-0 可灵图像生成
export const MODEL_OPTIONS = [
  { value: 'gpt-image-1', label: 'GPT Image 1' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
  { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
  { value: 'dall-e-3', label: 'DALL·E 3' },
  { value: 'dall-e-2', label: 'DALL·E 2' },
  { value: 'jimeng-5.0', label: '即梦 5.0' },
  { value: 'jimeng-4.6', label: '即梦 4.6' },
  { value: 'jimeng-4.5', label: '即梦 4.5' },
  { value: 'jimeng-4.1', label: '即梦 4.1' },
  { value: 'qwen-image-2.0-pro', label: '千问图像 2.0 Pro' },
  { value: 'qwen-image-2.0', label: '千问图像 2.0' },
  { value: 'wanx2.1-t2i-turbo', label: '万相 2.1 Turbo' },
  { value: 'flux-pro', label: 'FLUX Pro' },
  { value: 'kling-v2', label: '可灵 v2' },
];

export const DEFAULT_MODEL = 'gpt-image-1';

// 比例
export const ASPECT_OPTIONS = ['21:9', '16:9', '9:16', '1:1', '4:3', '3:4'];
// 尺寸
export const SIZE_OPTIONS = ['1k', '2k', '4k'];

// 节点显示配置
export const NODE_META = {
  [NODE_TYPES.textToImage]: { label: '文字生成图片', icon: '✍️', color: '#6366f1' },
  [NODE_TYPES.editImage]: { label: '编辑图片', icon: '🖌️', color: '#ec4899' },
  [NODE_TYPES.imageDisplay]: { label: '图片展示', icon: '🖼️', color: '#10b981' },
  [NODE_TYPES.note]: { label: '便签', icon: '📝', color: '#f59e0b' },
};

// 持久化配置文件名
export const CANVAS_CONFIG = 'canvas.json';
// 自动保存防抖(ms)
export const SAVE_DEBOUNCE = 600;
