import { createCanvas, loadImage } from './canvasUtils.js';

export function applyMaskAlpha(sourceRgba, maskRgba) {
  if (!sourceRgba || !maskRgba || sourceRgba.length !== maskRgba.length) {
    throw new Error('部件图片与蒙版尺寸不一致');
  }
  const output = new Uint8ClampedArray(sourceRgba);
  for (let i = 0; i < output.length; i += 4) {
    output[i + 3] = Math.min(output[i + 3], maskRgba[i]);
  }
  return output;
}

export function drawRegionPart(ctx, image, region) {
  const x = Math.round(region.x);
  const y = Math.round(region.y);
  const w = Math.max(1, Math.round(region.w));
  const h = Math.max(1, Math.round(region.h));
  const rotate = Number(region.rotate) || 0;
  ctx.clearRect(x, y, w, h);
  if (!rotate) {
    ctx.drawImage(image, x, y, w, h);
    return;
  }
  ctx.save();
  if (rotate === 90) {
    ctx.translate(x + w, y);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, 0, 0, h, w);
  } else if (rotate === 180) {
    ctx.translate(x + w, y + h);
    ctx.rotate(Math.PI);
    ctx.drawImage(image, 0, 0, w, h);
  } else if (rotate === 270) {
    ctx.translate(x, y + h);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(image, 0, 0, h, w);
  } else {
    ctx.drawImage(image, x, y, w, h);
  }
  ctx.restore();
}

export async function repaintRegionMask({
  inputSrc, maskSrc, previewAtlasCanvas, region,
  imageLoader = loadImage, canvasFactory = createCanvas,
}) {
  if (!inputSrc || !maskSrc || !previewAtlasCanvas || !region) {
    throw new Error('蒙版重绘上下文不完整');
  }
  const [inputImage, maskImage] = await Promise.all([
    imageLoader(inputSrc),
    imageLoader(maskSrc),
  ]);
  const width = Math.max(1, Math.round(inputImage.naturalWidth || inputImage.width));
  const height = Math.max(1, Math.round(inputImage.naturalHeight || inputImage.height));
  const inputCanvas = canvasFactory(width, height);
  const inputContext = inputCanvas.getContext('2d');
  inputContext.drawImage(inputImage, 0, 0, width, height);
  const maskCanvas = canvasFactory(width, height);
  const maskContext = maskCanvas.getContext('2d');
  maskContext.drawImage(maskImage, 0, 0, width, height);
  const sourceData = inputContext.getImageData(0, 0, width, height);
  const maskData = maskContext.getImageData(0, 0, width, height);
  const partCanvas = canvasFactory(width, height);
  partCanvas.getContext('2d').putImageData(
    new ImageData(applyMaskAlpha(sourceData.data, maskData.data), width, height),
    0,
    0,
  );

  const atlasCanvas = canvasFactory(previewAtlasCanvas.width, previewAtlasCanvas.height);
  const atlasContext = atlasCanvas.getContext('2d');
  atlasContext.drawImage(previewAtlasCanvas, 0, 0);
  drawRegionPart(atlasContext, partCanvas, region);
  return { partCanvas, previewAtlasCanvas: atlasCanvas };
}
