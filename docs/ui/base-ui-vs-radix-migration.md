# base-ui vs Radix 迁移差异

## 背景

项目的 `ui/*` 组件（[packages/web/src/components/ui/](../../packages/web/src/components/ui/)）底层是 `@base-ui/react`，**不是 Radix**（即 shadcn/ui 的 base-ui 变体）。两者的受控 API 有若干差异，照搬 Radix 写法会导致「受控值恒为初值/拖不动」「trigger 显示 raw value 而非 label」等问题。下面记录已踩过的坑。

## Slider：单 thumb 传单值，不要用数组

- **Radix**：单 thumb 也用数组，`value={[n]}`，`onValueChange` 回调收到数组，取 `value[0]`。
- **base-ui**：单 thumb 必须传**单值** `value={n}`。

```tsx
// ❌ base-ui 下 thumb 恒为 min，拖不动
<Slider value={[count]} onValueChange={(v) => onChange(v[0] || 1)} />

// ✅ 正确：单值 + 回调内兼容数组/单值
<Slider
  value={count}
  min={1}
  max={5}
  step={1}
  onValueChange={(v) => {
    const next = Array.isArray(v) ? v[0] : v;
    onChange(next);
  }}
/>
```

参考用法：[composer-shell.tsx](../../packages/web/src/components/composer/composer-shell.tsx)、[models-dialog.tsx](../../packages/web/src/components/sidebar/models-dialog.tsx)。

## Select.Value：默认显示 raw value，需手动映射 label

- **Radix**：`SelectValue` 自动渲染选中项的 children（即 `<SelectItem>{name}</SelectItem>` 里的 `name`）。
- **base-ui**：`SelectValue` **默认渲染选中项的原始 value**（如 `id`），不会自动取 item 文本。

```tsx
// ❌ base-ui 下 trigger 显示 group.id，不是名称
<Select value={selectedId} onValueChange={setSelectedId}>
  <SelectTrigger>
    <SelectValue placeholder="选择分组" />
  </SelectTrigger>
  <SelectContent>
    {groups.map((g) => (
      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
    ))}
  </SelectContent>
</Select>

// ✅ 修法 A：给 SelectValue 传 render 函数，按 value 查 label
<SelectValue placeholder="选择分组">
  {(value) => groups.find((g) => g.id === value)?.name || '选择分组'}
</SelectValue>

// ✅ 修法 B：给 Select.Root 传 items prop，自动做 label 映射（官方推荐）
<Select
  value={selectedId}
  onValueChange={setSelectedId}
  items={groups.map((g) => ({ value: g.id, label: g.name }))}
>
  <SelectTrigger><SelectValue placeholder="选择分组" /></SelectTrigger>
  {/* SelectItem 仍照常渲染 */}
</Select>
```

## 通用教训

遇到「受控控件值恒为初值、拖不动」或「trigger 显示 id 而非名称」这类现象，先确认底层库（shadcn 封装可能已从 Radix 换成 base-ui），再核对其受控 API 签名 —— 不要凭记忆套用 Radix 写法。

base-ui 官方文档：<https://base-ui.com>（Select.Value 默认 raw value、Slider 单值等行为均以官方文档为准）。
