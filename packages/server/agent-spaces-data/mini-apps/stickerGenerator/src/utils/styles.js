// 贴图风格常量 —— 对齐 StickerCraft 内置风格集，promptModifier 会拼进生成提示词
// previewImage 指向 /static/style-previews/{id}.webp（服务端 public 托管，ImageMagick 压缩）

export const STICKER_STYLES = [
  { id: 'classic-cartoon', name: 'Classic Cartoon', label_zh: '经典卡通', promptModifier: 'vibrant flat cartoon sticker, thick bold black outlines, simple shading, vector art style, cute and expressive', dot: '#facc15', previewImage: '/static/style-previews/classic-cartoon.webp' },
  { id: 'kawaii-chibi', name: 'Kawaii Chibi', label_zh: '可爱Q版', promptModifier: 'adorable kawaii chibi sticker, pastel colors, giant sparkling eyes, soft rounded shapes, bubbly aesthetic, white outline', dot: '#f472b6', previewImage: '/static/style-previews/kawaii-chibi.webp' },
  { id: '3d-glossy', name: '3D Glossy', label_zh: '3D光泽', promptModifier: '3D rendered toy sticker, plastic glossy texture, claymation style, soft studio lighting, cute character design, volumetric', dot: '#60a5fa', previewImage: '/static/style-previews/3d-glossy.webp' },
  { id: 'vintage-badge', name: 'Vintage Badge', label_zh: '复古徽章', promptModifier: 'retro vintage sticker, muted color palette, textured paper feel, 70s badge style, distressed look, typography elements', dot: '#fb923c', previewImage: '/static/style-previews/vintage-badge.webp' },
  { id: 'pixel-art', name: 'Pixel Art', label_zh: '像素艺术', promptModifier: 'pixel art sticker, 8-bit retro game style, blocky details, limited color palette, clean edges, white outline', dot: '#a78bfa', previewImage: '/static/style-previews/pixel-art.webp' },
  { id: 'watercolor', name: 'Watercolor', label_zh: '水彩画', promptModifier: 'watercolor painted sticker, artistic brush strokes, soft gradients, paper texture, dreamy and whimsical, hand-painted look', dot: '#2dd4bf', previewImage: '/static/style-previews/watercolor.webp' },
  { id: 'neon-cyberpunk', name: 'Neon Cyberpunk', label_zh: '霓虹赛博', promptModifier: 'neon cyberpunk sticker, glowing lights, futuristic, dark background, synthwave colors, high contrast', dot: '#d946ef', previewImage: '/static/style-previews/neon-cyberpunk.webp' },
  { id: 'paper-cutout', name: 'Paper Cutout', label_zh: '剪纸艺术', promptModifier: 'layered paper cutout style sticker, craft art, textured paper, depth shadows, handmade feel', dot: '#fdba74', previewImage: '/static/style-previews/paper-cutout.webp' },
  { id: 'graffiti', name: 'Graffiti', label_zh: '街头涂鸦', promptModifier: 'urban graffiti sticker, spray paint texture, street art, drips, bold wildstyle, vibrant', dot: '#84cc16', previewImage: '/static/style-previews/graffiti.webp' },
  { id: 'holographic', name: 'Holographic', label_zh: '全息镭射', promptModifier: 'holographic sticker, iridescent foil texture, metallic rainbow reflections, shiny, chromatic aberration', dot: '#22d3ee', previewImage: '/static/style-previews/holographic.webp' },
  { id: 'sketch', name: 'Pencil Sketch', label_zh: '铅笔素描', promptModifier: 'pencil sketch sticker, hand-drawn graphite, rough lines, artistic, monochrome or muted colors', dot: '#a8a29e', previewImage: '/static/style-previews/sketch.webp' },
  { id: 'anime', name: 'Anime', label_zh: '日系动漫', promptModifier: 'anime manga sticker, cel shaded, vibrant, japanese animation style, expressive, clean lines', dot: '#fb7185', previewImage: '/static/style-previews/anime.webp' },
  { id: 'flat-emoji', name: 'Flat Emoji', label_zh: '扁平表情', promptModifier: 'flat design emoji style, minimal vector, solid colors, UI icon aesthetic, simple shapes', dot: '#fde047', previewImage: '/static/style-previews/flat-emoji.webp' },
  { id: 'impressionist', name: 'Impressionist', label_zh: '印象油画', promptModifier: 'oil painting sticker, thick brush strokes, impressionist style, textured canvas, artistic', dot: '#d97706', previewImage: '/static/style-previews/impressionist.webp' },
  { id: 'stained-glass', name: 'Stained Glass', label_zh: '彩色玻璃', promptModifier: 'stained glass sticker, mosaic pattern, vibrant translucent colors, black lead lines, geometric', dot: '#059669', previewImage: '/static/style-previews/stained-glass.webp' },
  { id: 'psychedelic', name: 'Psychedelic', label_zh: '迷幻波普', promptModifier: 'psychedelic pop art sticker, swirling colors, trippy patterns, surreal, groovy, 60s style', dot: '#8b5cf6', previewImage: '/static/style-previews/psychedelic.webp' },
];

export const ASPECT_RATIOS = [
  { value: '1:1', label: '方形 1:1' },
  { value: '3:4', label: '竖版 3:4' },
  { value: '4:3', label: '横版 4:3' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '16:9', label: '横屏 16:9' },
];

export const SIZES = [
  { value: '1k', label: '标准 1K' },
  { value: '2k', label: '高清 2K' },
  { value: '4k', label: '超清 4K' },
];

export const BACKGROUND_COLORS = [
  { name: '白色', value: 'white', hex: '#ffffff' },
  { name: '黑色', value: 'black', hex: '#0f172a' },
  { name: '红色', value: 'pastel red', hex: '#ef4444' },
  { name: '蓝色', value: 'pastel blue', hex: '#3b82f6' },
  { name: '绿色', value: 'pastel green', hex: '#22c55e' },
  { name: '黄色', value: 'pastel yellow', hex: '#facc15' },
  { name: '粉色', value: 'pastel pink', hex: '#ec4899' },
  { name: '紫色', value: 'pastel purple', hex: '#a855f7' },
];

export const FONTS = [
  { name: '标准', value: 'Standard' },
  { name: '漫画', value: 'Comic' },
  { name: '手写', value: 'Script' },
];

export const TEXT_LANGUAGES = [
  { value: 'chinese', label: '中文', prompt: 'Chinese characters' },
  { value: 'english', label: '英文', prompt: 'English letters' },
  { value: 'japanese', label: '日文', prompt: 'Japanese characters' },
];

export const PRESET_PROMPTS = [
  '一只戴墨镜的猫',
  '吃披萨的机器人',
  '一只可爱的小狐狸',
  '魔法树屋',
  '黄色潜艇舰队',
  '跳舞的仙人掌',
];

export const LAYOUT_MODES = [
  { value: 'single', label: '单张贴图' },
  { value: 'threeViews', label: '三视图' },
  { value: 'collection', label: '贴纸集合' },
];

export const COLLECTION_COUNT_PRESETS = [4, 6, 9];

export const DEFAULT_FORM = {
  prompt: '',
  styleId: STICKER_STYLES[0].id,
  aspect: '1:1',
  size: '1k',
  model: '',
  references: [],
  layoutMode: 'single',
  collectionCount: 6,
  collectionItems: [],
  useStickerBorder: true,
  useFacialFeatures: true,
  textEnabled: false,
  textContent: '',
  textFont: 'Standard',
  textLanguage: 'chinese',
  backgroundEnabled: false,
  backgroundColor: 'white',
};

export function getStyle(id, customStyles = []) {
  return [...STICKER_STYLES, ...customStyles].find((s) => s.id === id) || STICKER_STYLES[0];
}

// 把表单可选项翻译成最终提交给工作流的 prompt 字符串。
// 工作流只认 prompt / model / aspect / size / images，
// 所以风格 / 文字 / 背景 / 布局都拼进 prompt。
export function buildPrompt(form, customStyles = []) {
  const style = getStyle(form.styleId, customStyles);
  const parts = [String(form.prompt || '').trim()];

  if (style?.promptModifier) parts.push(style.promptModifier);

  const extras = [];
  if (form.layoutMode === 'threeViews') extras.push('three-view character sheet design (front, side, back)');
  if (form.layoutMode === 'collection') {
    extras.push(`a cohesive sticker collection sheet with ${form.collectionCount} small stickers arranged together on one image`);
    // 把每个子贴纸的内容描述拼进去，让 AI 在同一张图里分别画出
    const items = Array.isArray(form.collectionItems)
      ? form.collectionItems.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    if (items.length) {
      extras.push(`each sticker depicts a different subject: ${items.join('; ')}`);
    }
  }
  if (form.useStickerBorder) extras.push('thick white die-cut sticker border outline');
  if (form.useFacialFeatures) extras.push('expressive facial features');
  if (form.backgroundEnabled && form.backgroundColor) {
    extras.push(`${form.backgroundColor} solid background`);
  } else {
    extras.push('transparent background, isolated subject');
  }
  if (form.textEnabled) {
    const content = String(form.textContent || '').trim();
    const lang = TEXT_LANGUAGES.find((l) => l.value === form.textLanguage) || TEXT_LANGUAGES[0];
    if (content) {
      // 明确指定文字语言，避免 AI 默认用英文渲染中文/日文内容
      extras.push(`with the exact text "${content}" written in ${lang.prompt}, rendered in ${form.textFont} lettering, do not translate or change the text`);
    } else {
      extras.push(`with decorative ${lang.prompt} typography, rendered in ${form.textFont} lettering`);
    }
  }
  if (extras.length) parts.push(extras.join(', '));

  parts.push('sticker, die-cut, high quality, centered composition');
  return parts.filter(Boolean).join(', ');
}
