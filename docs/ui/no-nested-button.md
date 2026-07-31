# 禁止 `<button>` 嵌套 `<button>`

## 背景

HTML 规范规定 `<button>`（及所有交互式元素）不得作为另一个 `<button>` 的后代。违反该规则会在 React 18+ / Next.js 16 中触发 hydration error，控制台报：

```
<button> cannot contain a nested <button>.
In HTML, <button> cannot be a descendant of <button>.
This will cause a hydration error.
```

## 根因

本项目（`game-asset-canvas` mini-app 等）大量使用「整张卡片可点击」的布局：

- 外层 `<button onClick={handlePick}>` 包裹整张卡片，用于选中/填充。
- 卡片内部又渲染了带交互的子按钮（查看大图、编辑、删除、`ImageHoverCard` 的 trigger 等）。

典型陷阱在于 `ImageHoverCard`：其 `HoverCardTrigger` 虽用 `render={<div>}` 包了一层，但最终 DOM 树仍是 `<button>…<div>…<button>…</button>…</div>…</button>`，div 不改变 button 嵌套 button 的事实。

错误示例：

```jsx
<button type="button" onClick={() => handlePick(p)}>
  <span>{p.title}</span>
  <ImageHoverCard
    renderTrigger={() => (
      <button type="button" onClick={(e) => openMediaGallery(...)}>查看大图</button>
    )}
  />
</button>
```

## 方案

把外层用于整体点击的 `<button>` 改为带语义的 `<div>`，保留可点击能力与无障碍语义：

```jsx
<div
  role="button"
  tabIndex={0}
  onClick={() => handlePick(p)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePick(p);
    }
  }}
>
  <span>{p.title}</span>
  <ImageHoverCard
    renderTrigger={() => (
      <button type="button" onClick={(e) => openMediaGallery(...)}>查看大图</button>
    )}
  />
</div>
```

要点：

- `role="button"` + `tabIndex={0}` 保留可聚焦/可点击的语义。
- `onKeyDown` 处理 Enter / Space，保证键盘可达（对应原生 button 的默认行为）。
- 内层子按钮（查看大图、编辑、删除）保持 `<button>` 不变，独立工作。
- 子按钮的 `onClick` 仍需 `e.stopPropagation()`，避免冒泡触发外层卡片选中。

## 适用判定

遇到以下任一情况，按本方案处理：

- 卡片/列表项整体可点击，且内部还有交互按钮。
- `ImageHoverCard`、`HoverCard`、`DropdownMenu` 等 trigger 被放进另一个 button 内。
- 控制台出现 `cannot contain a nested <button>` / `cannot be a descendant of <button>`。

无需处理的情况：

- 整张卡片只有一个点击行为、内部没有其他交互元素 → 保持 `<button>`。
- 内部交互按钮位于卡片的兄弟节点（而非后代），例如用 `absolute` 定位的悬浮操作层 → 结构合法。

## 已知覆盖范围

- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/PromptPickerDialog.jsx`
  - 提示词卡片外层 button → div（`ImageHoverCard` 的「查看大图」trigger 为内层 button）。

其它 mini-app 若复用了同样的「整卡可点击 + 子按钮」结构，新增前先搜索：

```powershell
rg -n "ImageHoverCard|renderTrigger" "packages/server/agent-spaces-data/mini-apps"
```

## 验收

1. 打开目标页面（如 game-asset-canvas 的「提示词管理」）。
2. 打开浏览器控制台 → 不再出现 `<button> cannot contain a nested <button>` 报错。
3. 带参考图的卡片：
   - 点击卡片本体 → 正常触发选中/填充。
   - 点击缩略图 → 弹出大图预览。
   - hover 缩略图 → 弹出 HoverCard。
4. 键盘 Tab 聚焦到卡片，按 Enter / Space → 触发与点击一致的行为。
5. `git diff --check` 通过。

## 新增组件检查清单

- 卡片内部是否还有 button / 链接 / 可交互 trigger。
- 外层容器是否必须是 `<button>`；能否改为 `role="button"` 的 div。
- 改为 div 后是否补齐 `tabIndex` 和 `onKeyDown`（Enter/Space）。
- 内层子按钮是否调用 `e.stopPropagation()` 避免误触发外层。
- 是否在明色/暗色、hover/选中/禁用状态下都保持视觉一致。
