/**
 * mini-app RecordManager：canvas 视频录制封装（MediaRecorder + WebM）。
 *
 * 职责：
 * 1. 把 WebGL Canvas 的目标区域逐帧绘制到裁剪 Canvas
 * 2. 用裁剪 Canvas.captureStream(fps) 获取画面流
 * 3. MediaRecorder 编码为 WebM（优选 vp9，降级 vp8/base）
 * 4. stop() 返回 base64 dataUrl
 *
 * 不负责：UI 状态和播放模式切换。
 *
 * 兼容性：MediaRecorder/captureStream 在现代 Chromium 系浏览器可用；
 * Firefox 部分支持；Safari 不支持。isSupported() 用于 UI 禁用。
 */

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function normalizeCaptureRect(rect, sourceWidth, sourceHeight) {
  const full = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0) return full;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(sourceWidth, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(sourceHeight, Math.ceil(rect.y + rect.height));
  if (right <= x || bottom <= y) return full;
  return { x, y, width: right - x, height: bottom - y };
}

export class RecordManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.recorder = null;
    this.stream = null;
    this.captureCanvas = null;
    this.captureContext = null;
    this.captureRect = null;
    this.captureFrame = null;
    this.chunks = [];
    this._recording = false;
    this._stopResolve = null;
  }

  get isRecording() {
    return this._recording;
  }

  /** 浏览器是否支持 canvas 录制 */
  static isSupported() {
    return typeof MediaRecorder !== 'undefined'
      && typeof HTMLCanvasElement !== 'undefined'
      && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  /** 开始录制 */
  start({ fps = 30, crop = null } = {}) {
    if (this._recording) throw new Error('已在录制中');
    if (!RecordManager.isSupported()) {
      throw new Error('当前浏览器不支持 canvas 录制（MediaRecorder/captureStream 不可用）');
    }
    this.captureRect = normalizeCaptureRect(crop, this.canvas.width, this.canvas.height);
    this.captureCanvas = document.createElement('canvas');
    this.captureCanvas.width = Math.max(2, Math.ceil(this.captureRect.width / 2) * 2);
    this.captureCanvas.height = Math.max(2, Math.ceil(this.captureRect.height / 2) * 2);
    this.captureContext = this.captureCanvas.getContext('2d');
    if (!this.captureContext) throw new Error('无法创建视频裁剪画布');
    const drawFrame = () => {
      if (!this.captureContext || !this.captureRect) return;
      const { x, y, width, height } = this.captureRect;
      this.captureContext.drawImage(
        this.canvas,
        x, y, width, height,
        0, 0, this.captureCanvas.width, this.captureCanvas.height,
      );
      if (this._recording) this.captureFrame = requestAnimationFrame(drawFrame);
    };
    drawFrame();
    try {
      this.stream = this.captureCanvas.captureStream(fps);
      const mimeType = pickMimeType();
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType || 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          this._cleanup();
          this._stopResolve?.(reader.result);
          this._stopResolve = null;
        };
        reader.onerror = () => {
          this._cleanup();
          this._stopResolve?.(null);
          this._stopResolve = null;
        };
        reader.readAsDataURL(blob);
      };
      this.recorder.start();
      this._recording = true;
      this.captureFrame = requestAnimationFrame(drawFrame);
    } catch (error) {
      this._cleanup();
      throw error;
    }
  }

  /** 停止录制，返回 Promise<dataUrl|null> */
  stop() {
    if (!this._recording) return Promise.resolve(null);
    return new Promise((resolve) => {
      this._stopResolve = resolve;
      try {
        this.recorder.stop();
      } catch (e) {
        this._cleanup();
        resolve(null);
      }
    });
  }

  _cleanup() {
    this._recording = false;
    if (this.captureFrame != null) cancelAnimationFrame(this.captureFrame);
    this.captureFrame = null;
    this.recorder = null;
    // 停止所有轨道，释放摄像头/画面资源
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.chunks = [];
    this.captureCanvas = null;
    this.captureContext = null;
    this.captureRect = null;
  }
}

export default RecordManager;
