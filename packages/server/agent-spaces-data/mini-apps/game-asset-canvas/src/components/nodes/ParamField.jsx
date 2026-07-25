// 共享参数字段渲染器：图像处理节点 / 抠图节点 / 执行对话框 复用。
// 支持的 param.type：bool / color / select / text / number。
// 支持 param.showWhen: { key, eq? | in? } 按 allParams[key] 条件显隐。
export default function ParamField({ param, value, onChange, allParams = {} }) {
  // 条件显隐：showWhen.key 的当前值需满足 eq 或 in
  if (param.showWhen) {
    const dep = allParams[param.showWhen.key] ?? param.default;
    const ok = 'eq' in param.showWhen
      ? dep === param.showWhen.eq
      : (Array.isArray(param.showWhen.in) ? param.showWhen.in.includes(dep) : true);
    if (!ok) return null;
  }
  if (param.type === 'bool') {
    return (
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        <span className="text-muted-foreground">{param.label}</span>
      </label>
    );
  }
  if (param.type === 'color') {
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{param.label}</span>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-border bg-background"
        />
      </label>
    );
  }
  if (param.type === 'select') {
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{param.label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
        >
          {(param.options || []).map((opt) => {
            const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
            return <option key={o.value} value={o.value}>{o.label}</option>;
          })}
        </select>
      </label>
    );
  }
  if (param.type === 'text') {
    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground" title={param.tooltip}>{param.label}</span>
        <input
          type="text"
          value={value ?? ''}
          placeholder={param.tooltip || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
        />
      </label>
    );
  }
  // number
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{param.label}</span>
      <input
        type="number"
        value={value ?? param.default}
        min={param.min}
        max={param.max}
        step={param.step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}
