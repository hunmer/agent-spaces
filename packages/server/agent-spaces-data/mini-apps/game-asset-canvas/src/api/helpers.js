export function asString(v, def = '') {
  return typeof v === 'string' ? v.trim() : def;
}

export function parseNodeData(value, fieldName = 'data') {
  if (value === undefined) return { ok: true, value: undefined };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: `${fieldName} 必须是对象` };
  if (Object.keys(value).length === 1 && typeof value.$text === 'string') {
    try {
      const parsed = JSON.parse(value.$text.trim());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, message: `${fieldName}.$text 必须是 JSON 对象` };
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, message: `${fieldName}.$text 不是合法 JSON` };
    }
  }
  return { ok: true, value };
}

export function parseGroupLayout(value, fieldName = 'groupLayout') {
  if (value === undefined) return { ok: true, value: undefined };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: `${fieldName} 必须是对象 {direction?, grid?}` };
  const direction = asString(value.direction) || 'LR';
  if (direction !== 'LR' && direction !== 'TB') return { ok: false, message: `${fieldName}.direction 仅支持 LR（横向）或 TB（纵向）` };
  let grid;
  if (value.grid !== undefined) {
    if (!value.grid || typeof value.grid !== 'object' || Array.isArray(value.grid)) return { ok: false, message: `${fieldName}.grid 必须是对象 {rows, columns, horizontalGap, verticalGap}` };
    const rows = Number(value.grid.rows), columns = Number(value.grid.columns), horizontalGap = Number(value.grid.horizontalGap), verticalGap = Number(value.grid.verticalGap);
    if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) return { ok: false, message: `${fieldName}.grid.rows 和 columns 必须是大于等于 1 的整数` };
    if (!Number.isFinite(horizontalGap) || horizontalGap < 0 || !Number.isFinite(verticalGap) || verticalGap < 0) return { ok: false, message: `${fieldName}.grid.horizontalGap 和 verticalGap 必须是非负有限数字` };
    grid = { rows, columns, horizontalGap, verticalGap };
  }
  return { ok: true, value: { direction, ...(grid ? { grid } : {}) } };
}

export function rpc(ctx, type, payload) {
  return ctx.requestClient(type, payload || {}, 8000);
}
