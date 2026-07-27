// 共享参数字段渲染器：图像处理节点 / 抠图节点 / 执行对话框 复用。
// 支持的 param.type：bool / color / select / text / number。
// 支持 param.showWhen: { key, eq? | in? } 按 allParams[key] 条件显隐。
// 组件统一使用 @agent-spaces/ui；带 param.colorPicker:true 的颜色字段保留 onPickColor 吸色入口。
import {
  Checkbox, Input, NumberInput,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@agent-spaces/ui';

export default function ParamField({ param, value, onChange, onPickColor, colorPickerDisabled, allParams = {} }) {
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
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(Boolean(v))}
        />
        <span className="text-muted-foreground">{param.label}</span>
      </label>
    );
  }
  if (param.colorPicker && onPickColor) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{param.label}</span>
        <button
          type="button"
          onClick={onPickColor}
          disabled={colorPickerDisabled}
          className="flex min-w-0 items-center gap-2 rounded border border-border bg-background px-2 py-1 text-xs transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="h-4 w-4 shrink-0 rounded-sm border border-border" style={{ backgroundColor: value || 'transparent' }} />
          <span className="max-w-24 truncate font-mono">{value || '透明'}</span>
        </button>
      </div>
    );
  }
  if (param.type === 'color') {
    return (
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{param.label}</span>
        <Input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer p-0"
        />
      </div>
    );
  }
  if (param.type === 'select') {
    const options = (param.options || []).map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt));
    return (
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{param.label}</span>
        <Select
          value={value}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger size="sm" className="h-7 w-32 text-xs">
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (param.type === 'text') {
    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground" title={param.tooltip}>{param.label}</span>
        <Input
          type="text"
          value={value ?? ''}
          placeholder={param.tooltip || ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-xs"
        />
      </label>
    );
  }
  // number
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{param.label}</span>
      <NumberInput
        value={value ?? param.default}
        min={param.min}
        max={param.max}
        step={param.step ?? 1}
        onChange={(v) => onChange(v ?? param.default)}
        className="h-7 w-24"
      />
    </div>
  );
}
