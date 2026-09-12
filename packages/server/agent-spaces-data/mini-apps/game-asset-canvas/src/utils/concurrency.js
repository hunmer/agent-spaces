/**
 * 并发限流映射：worker-pool 模式（共享游标 + N 个 worker），保序返回。
 *
 * 返回形状与 Promise.allSettled 一致（[{status:'fulfilled',value} | {status:'rejected',reason}]），
 * 可直接替换 allSettled(map(...)) 调用点，后续结果收集逻辑不变。
 * 单项失败不阻塞其他项；limit 非法时回退为不限并发（等价 allSettled）。
 *
 * @param {Array} items 输入数组
 * @param {number} limit 最大并发数（<=0/NaN/Infinity → 不限）
 * @param {(item, index) => Promise<any>} fn 每项执行函数
 * @param {(done: number, total: number) => void} [onProgress] 每完成一项回调（含失败项）
 * @returns {Promise<Array<{status:'fulfilled',value}|{status:'rejected',reason}>>}
 */
export async function mapWithConcurrency(items, limit, fn, onProgress) {
  const list = Array.isArray(items) ? items : [...items];
  const n = Number(limit);
  const max = Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), list.length) : list.length;
  const results = new Array(list.length);
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= list.length) return;
      try {
        results[i] = { status: 'fulfilled', value: await fn(list[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
      done += 1;
      if (typeof onProgress === 'function') onProgress(done, list.length);
    }
  };
  await Promise.all(Array.from({ length: max }, worker));
  return results;
}

/** 把用户输入/参数夹到 [min,max] 的合法并发数；空值/非法值回退 fallback */
export function clampConcurrency(value, fallback, min = 1, max = 8) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
