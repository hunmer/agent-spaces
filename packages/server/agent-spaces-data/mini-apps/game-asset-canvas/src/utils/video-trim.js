import { normalizeImageUrl } from './workflow';

const FFMPEG_PLUGIN_ID = 'workflow.ffmpeg';
const FFMPEG_TRIM = 'ffmpeg_trim';

/**
 * 视频时间区间裁剪（ffmpeg_trim，input seeking）。
 * - fast=false（默认）重编码：切点帧级精确，耗时长视频较慢
 * - fast=true 流复制：几乎瞬时，但切点向前对齐到最近关键帧（产物区间可能略长）
 *
 * @param {string} url   视频 http URL
 * @param {number} start 起点秒（>=0）
 * @param {number} end   终点秒（> start）
 * @param {{fast?: boolean}} [opts]
 * @returns {Promise<string>} 裁剪产物 http URL（已补全 origin）
 */
export async function trimVideo(url, start, end, opts = {}) {
  const s = Math.max(0, Number(start) || 0);
  const e = Number(end);
  if (!Number.isFinite(e) || e <= s) throw new Error('终点必须大于起点');
  const ret = await window.AgentSpaces.callPluginTool(FFMPEG_PLUGIN_ID, FFMPEG_TRIM, {
    inputPath: url,
    start: s,
    end: e,
    mode: opts.fast ? 'copy' : 'reencode',
  });
  if (!ret?.success || !ret?.data?.httpPath) throw new Error(ret?.message || '视频裁剪失败');
  return normalizeImageUrl(ret.data.httpPath);
}

/** 归一化裁剪区间：clamp 进 [0, duration]，start < end，非法值回退 0..0 */
export function normalizeTrimRange(start, end, duration) {
  const d = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : null;
  const clamp = (v) => {
    const n = Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
    return d != null ? Math.min(n, d) : n;
  };
  let s = clamp(start);
  let e = clamp(end);
  if (e <= s) e = s;
  return { start: s, end: e };
}
