/**
 * 图像处理器注册表：连接节点与底层算法。
 *
 * 每个 processor：
 * {
 *   id, label, category, desc,
 *   params: [{ key, label, type:'number'|'color'|'select'|'bool', default, min?, max?, options? }],
 *   multipleIn?: boolean,   // 是否需要多输入（如图层叠加）
 *   multipleOut?: boolean,  // 是否产出多帧（如 GIF 拆帧 → 多张 PNG）
 *   async run(inputs: ImageData[], params, ctx): Promise<ImageData[]>
 *     - inputs: 上游图片转成的 ImageData 数组（通常 1 张；multipleIn 时多张）
 *     - ctx: { urls?: string[] } 原始输入 URL（GIF 拆帧需 fetch 拿 buffer）
 *     - 返回 ImageData[]（通常 1 张；multipleOut 时多张）
 * }
 *
 * 节点层（ImageProcessNode + Canvas.handleProcessLocal）负责：
 * 1. 从上游 URL 解码成 ImageData（io.urlToImageData）
 * 2. 调对应 processor.run
 * 3. 产出 ImageData → blob → uploadFile → http URL → 回填节点
 */
import { decodeGifToFrames, encodeFramesToGif } from './gif';
import { chromaKey, erodeAlpha, hexToRgb, whiteKey } from './matte';
import { composeLayers } from './compose';
import { pixelate } from './pixelate';
import { composeSpriteSheet, splitByTransparent, splitSpriteSheet } from './spriteSheet';
import { imageDataToUrl, urlToImageData } from './io';
import { innerStroke, resizeNearest } from './stroke';

/**
 * 处理器清单。节点 constants.IMAGE_PROCESSORS 里的参数表与此处的 id 一一对应，
 * 但常量定义放 constants.js（UI 层），run 实现放这里（算法层），解耦 UI 与算法。
 */
export const PROCESSORS = {
  // ============ GIF ============
  'gif-split': {
    async run(_inputs, params, ctx) {
      const url = ctx?.urls?.[0];
      if (!url) throw new Error('GIF 拆帧需要 GIF 文件输入');
      const resp = await fetch(url);
      const buf = await resp.arrayBuffer();
      const { frames } = await decodeGifToFrames(buf);
      return frames;
    },
  },
  'gif-merge': {
    async run(inputs, params) {
      if (inputs.length < 2) throw new Error('GIF 合成需要至少 2 帧输入');
      // 合成 GIF 后只有 1 个产出（但产出类型是 gif，上传时仍按图片）
      const blob = await encodeFramesToGif(inputs, params.delay ?? 100);
      const file = new File([blob], `merge-${Date.now()}.gif`, { type: 'image/gif' });
      const AS = window.AgentSpaces;
      if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
      const uploaded = await AS.uploadFile(file);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('GIF 上传未返回 URL');
      // run 约定返回 ImageData[]，但 GIF 合成的产出就是 gif URL，无法表示成 ImageData
      // 用 ctx 透传：这里返回单张占位图（第一帧），真实 URL 通过特殊返回约定传递
      // 改为返回 [{ __gifUrl: httpUrl }] 占位，调用方识别
      return [{ __gifUrl: httpUrl, width: inputs[0].width, height: inputs[0].height, data: inputs[0].data.slice(0) }];
    },
  },

  // ============ Sprite Sheet ============
  'sprite-split': {
    async run(inputs, params) {
      const [img] = inputs;
      if (!img) throw new Error('Sheet 拆分需要输入图');
      if (params.auto) {
        const cells = splitByTransparent(img);
        if (!cells.length) throw new Error('未检测到内容区域（整图透明？）');
        return cells;
      }
      const cols = Math.max(1, params.cols ?? 4);
      const rows = Math.max(1, params.rows ?? 4);
      return splitSpriteSheet(img, cols, rows);
    },
  },
  'sprite-merge': {
    multipleIn: true,
    async run(inputs, params) {
      if (inputs.length < 2) throw new Error('Sheet 合成需要至少 2 帧输入');
      return [composeSpriteSheet(inputs, { columns: params.columns, spacing: params.spacing })];
    },
  },

  // ============ 像素 ============
  pixelate: {
    async run(inputs, params) {
      const [img] = inputs;
      if (!img) throw new Error('像素化需要输入图');
      return [await pixelate(img, {
        numColors: params.numColors ?? 16,
        blockSize: params.blockSize ?? 4,
        transparentBg: true,
      })];
    },
  },
  'resize-nearest': {
    async run(inputs, params) {
      const [img] = inputs;
      if (!img) throw new Error('缩放需要输入图');
      return [resizeNearest(img, params.targetW ?? 256, params.targetH ?? 256)];
    },
  },
  'inner-stroke': {
    async run(inputs, params) {
      const [img] = inputs;
      if (!img) throw new Error('内描边需要输入图');
      const color = hexToRgb(params.strokeColor ?? '#000000');
      return [innerStroke(img, params.strokeWidth ?? 2, color)];
    },
  },

  // ============ 抠图 ============
  'chroma-key': {
    async run(inputs, params) {
      const [img] = inputs;
      if (!img) throw new Error('色度键抠图需要输入图');
      const keyColor = hexToRgb(params.keyColor ?? '#00ff00');
      let result = chromaKey(img, keyColor, params.tolerance ?? 80, params.smoothness ?? 30, 0);
      const erodePasses = Math.max(0, Math.floor(params.erode ?? 0));
      if (erodePasses > 0) result = erodeAlpha(result, erodePasses);
      return [result];
    },
  },
  'white-key': {
    async run(inputs, params) {
      const [img] = inputs;
      if (!img) throw new Error('白底抠图需要输入图');
      let result = whiteKey(img, params.tolerance ?? 30);
      const erodePasses = Math.max(0, Math.floor(params.erode ?? 0));
      if (erodePasses > 0) result = erodeAlpha(result, erodePasses);
      return [result];
    },
  },

  // ============ 合成 ============
  'compose-overlay': {
    multipleIn: true,
    async run(inputs, params) {
      if (inputs.length < 2) throw new Error('图层叠加需要至少 2 个输入');
      return [composeLayers(inputs, { mode: params.mode ?? 'normal' })];
    },
  },
};

/**
 * 统一执行入口：节点层调用。
 * 负责输入解码 → run → 产出转 URL。
 * @param {string} processorId
 * @param {string[]} inputUrls 上游图片 URL
 * @param {object} params 处理器参数
 * @returns {Promise<string[]>} 产出图片的 http URL 数组
 */
export async function runProcessor(processorId, inputUrls, params) {
  const processor = PROCESSORS[processorId];
  if (!processor) throw new Error(`未知处理器：${processorId}`);

  // GIF 拆帧不预解码（需 ArrayBuffer），通过 ctx 透传 URL
  const needPreDecode = processorId !== 'gif-split';
  let inputs = [];
  if (needPreDecode) {
    inputs = await Promise.all((inputUrls || []).map((u) => urlToImageData(u)));
  }

  const outputs = await processor.run(inputs, params || {}, { urls: inputUrls });

  // 产出转 http URL。GIF 合成的产出带 __gifUrl 标记，直接用
  const urls = [];
  for (const out of outputs) {
    if (out && out.__gifUrl) {
      urls.push(out.__gifUrl);
    } else {
      urls.push(await imageDataToUrl(out));
    }
  }
  return urls;
}
