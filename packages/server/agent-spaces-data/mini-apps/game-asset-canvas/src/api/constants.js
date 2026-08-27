export const VALID_NODE_TYPES = [
  'text', 'storyboard', 'textToImage', 'editImage', 'imageDisplay', 'imageProcess',
  'ipGifSplit', 'ipGifMerge', 'ipSpriteSplit', 'ipSpriteMerge', 'ipPixelate',
  'ipResizeNearest', 'ipInnerStroke', 'ipChromaKey', 'ipWhiteKey', 'ipComposeOverlay',
  'ipEnhance', 'ipCompress', 'imageEditor', 'pixelEditor', 'uiSplitter', 'bboxViewer',
  'promptReverse', 'textToVoice', 'videoGenerator', 'imageCompare', 'cutout',
  'depthExtract', 'directorDesk', 'photopea', 'workflowRunner', 'spineEditor',
  'spineDisplay', 'videoDisplay', 'audioDisplay', 'videoEditor', 'maskPaint', 'note',
];

export const NODE_LABELS = {
  text: '文字', storyboard: '分镜创作', textToImage: '文字生成图片', editImage: '编辑图片',
  imageDisplay: '图片展示', imageProcess: '图像处理', ipGifSplit: 'GIF 拆帧', ipGifMerge: 'GIF 合成',
  ipSpriteSplit: 'Sheet 拆分', ipSpriteMerge: '网格拼接', ipPixelate: '像素化', ipResizeNearest: '最近邻缩放',
  ipInnerStroke: '内描边', ipChromaKey: '色度键抠图', ipWhiteKey: '白底抠图', ipComposeOverlay: '图层叠加',
  ipEnhance: '图片放大', ipCompress: '图片压缩', imageEditor: '图片编辑', pixelEditor: '像素编辑器',
  uiSplitter: '雪碧图拆分', bboxViewer: 'UI 拆分', promptReverse: '反推提示词', textToVoice: '生成配音',
  videoGenerator: '生成视频', imageCompare: '图片对比', cutout: '抠图', depthExtract: '提取深度图',
  directorDesk: '3D导演台', photopea: '在线PS', workflowRunner: '执行工作流', spineEditor: '骨骼编辑器',
  spineDisplay: 'Spine展示', videoDisplay: '视频展示', audioDisplay: '音频展示', videoEditor: '视频编辑器',
  maskPaint: '蒙版绘制', note: '便签',
};
