/**
 * RecordManager：canvas 视频录制封装（MediaRecorder + WebM）。
 *
 * 职责：
 * 1. 用 canvas.captureStream(fps) 抓 WebGL 画面流
 * 2. MediaRecorder 编码为 WebM（优选 vp9，降级 vp8/base）
 * 3. stop() 返回 base64 dataUrl（供 postMessage 回传父窗口）
 *
 * 不负责：UI 状态、模式切换（由 main.js 串联）。
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

export class RecordManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.recorder = null;
    this.stream = null;
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
  start({ fps = 30 } = {}) {
    if (this._recording) throw new Error('已在录制中');
    if (!RecordManager.isSupported()) {
      throw new Error('当前浏览器不支持 canvas 录制（MediaRecorder/captureStream 不可用）');
    }
    this.stream = this.canvas.captureStream(fps);
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
    this.recorder = null;
    // 停止所有轨道，释放摄像头/画面资源
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.chunks = [];
  }
}

export default RecordManager;
