/**
 * GIF 拆帧 + 合成。
 * 来源：FrameRonin frontend/src/components/GifFrameConverter.tsx 的 compositeFrame / runGifToFrames / runFramesToGif。
 * 依赖：gifuct-js（解码）、gifenc（编码），通过 CDN 加载。
 */
import { getGifEnc, getGifUct } from './cdn';

/**
 * GIF 帧合成（处理 disposal type 2 清屏 + patch 覆盖）。
 * 来源：GifFrameConverter.tsx compositeFrame。
 * @param {Uint8ClampedArray} prevBuf 上一帧合成缓冲
 * @param {{ patch: Uint8ClampedArray, dims: {top,left,width,height}, disposalType?: number }} frame
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} 新合成缓冲
 */
function compositeFrame(prevBuf, frame, width, height) {
  const buf = new Uint8ClampedArray(prevBuf);
  const { patch, dims, disposalType = 1 } = frame;
  const { top, left, width: pw, height: ph } = dims;

  if (disposalType === 2) {
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
    }
  }

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const idx = (py * pw + px) * 4;
      const a = patch[idx + 3];
      const outY = top + py;
      const outX = left + px;
      if (outY >= 0 && outY < height && outX >= 0 && outX < width) {
        const outIdx = (outY * width + outX) * 4;
        if (a === 0) {
          buf[outIdx] = 0; buf[outIdx + 1] = 0; buf[outIdx + 2] = 0; buf[outIdx + 3] = 0;
        } else {
          buf[outIdx] = patch[idx];
          buf[outIdx + 1] = patch[idx + 1];
          buf[outIdx + 2] = patch[idx + 2];
          buf[outIdx + 3] = a;
        }
      }
    }
  }
  return buf;
}

/**
 * GIF 拆帧：GIF ArrayBuffer → ImageData[]（每帧完整合成）。
 * 来源：runGifToFrames。
 * @param {ArrayBuffer} gifBuffer
 * @returns {Promise<{ frames: ImageData[], width: number, height: number }>}
 */
export async function decodeGifToFrames(gifBuffer) {
  const { parseGIF, decompressFrames } = await getGifUct();
  const gif = parseGIF(gifBuffer);
  const frames = decompressFrames(gif, true);
  const w = gif.lsd.width;
  const h = gif.lsd.height;

  let prevBuf = new Uint8ClampedArray(w * h * 4);
  prevBuf.fill(0);

  const out = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    prevBuf = compositeFrame(prevBuf, f, w, h);
    const imgData = new ImageData(new Uint8ClampedArray(prevBuf), w, h);
    out.push(imgData);
  }
  return { frames: out, width: w, height: h };
}

/**
 * 多帧 ImageData → GIF Blob。
 * 来源：runFramesToGif。透明色处理：alpha<128 当透明。
 * @param {ImageData[]} frames 尺寸需一致
 * @param {number} delay 帧间隔 ms
 * @returns {Promise<Blob>}
 */
export async function encodeFramesToGif(frames, delay = 100) {
  if (!frames.length) throw new Error('无帧可合成');
  const { GIFEncoder, quantize, applyPalette } = await getGifEnc();
  const w = frames[0].width;
  const h = frames[0].height;
  const gif = GIFEncoder();

  for (const frame of frames) {
    const { data, width, height } = frame;
    const palette = quantize(data, 255, {
      format: 'rgba4444',
      oneBitAlpha: 128,
      clearAlpha: true,
      clearAlphaThreshold: 128,
    });
    const index = applyPalette(data, palette, 'rgba4444');
    const transIdx = palette.findIndex((c) => c[3] === 0);

    let finalPalette;
    let finalIndex;
    let transparentIndex;
    if (transIdx >= 0) {
      finalPalette = [...palette];
      finalIndex = index;
      transparentIndex = transIdx;
    } else {
      // 无现成透明色，补一个 [0,0,0,0] 到调色板头部
      finalPalette = [[0, 0, 0, 0], ...palette];
      finalIndex = new Uint8Array(index.length);
      for (let j = 0; j < data.length; j += 4) {
        finalIndex[j / 4] = data[j + 3] < 128 ? 0 : index[j / 4] + 1;
      }
      transparentIndex = 0;
    }
    gif.writeFrame(finalIndex, width, height, {
      palette: finalPalette,
      delay,
      transparent: true,
      transparentIndex,
    });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
