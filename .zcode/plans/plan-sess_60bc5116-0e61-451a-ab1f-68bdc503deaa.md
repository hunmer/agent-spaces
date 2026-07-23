## 修复范围
仅改 `packages/web/src/components/git/git-changes-panel.tsx` 一个文件。

## 改动 1：修复点击文件不开新 tab

**`FileDiffHoverCard` 的 Trigger（第 70-80 行附近）**
- 给 `HoverCardTrigger` 增加 `render={<div />}`，让 Trigger 渲染成 `<div>` 而非默认的 `<a>`，消除 `<a>` 套 `<button>`（stage/discard）的非法嵌套，恢复正常的 click 冒泡。
- 保留现有 `delay`/`closeDelay`/`className`/`onClick`/`onContextMenu`（base-ui 会把这些 props 合并到 render 元素上，事件正常工作）。

**`GitChangesPanel` 文件列表（第 166 行）**
- 去掉 `isVertical ? undefined : onOpenFile` 的限制，改为始终传 `onOpenFile={onOpenFile}`，使垂直/窄屏布局下点击也能打开文件（移动端若有 hover 冲突属后续优化，不在本次范围）。

## 改动 2：图片 hovercard 显示预览图

**`FileDiffHoverCard` 的 `HoverCardContent`（第 81-102 行附近）**
- 新增导入：`import { getMediaType } from "@/stores/editor";`
- 在 `diff.isBinary` 分支前，先按扩展名判断是否为图片（`getMediaType(path) === 'image'`）：
  - 图片：不再等待 diff 结果，直接渲染 `<img src={`/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}&raw=true`} alt={path} className="block max-w-full max-h-[340px] object-contain" />`。即图片 hover 不发 diff 请求，更快。
  - 非图片二进制：保留 "Binary file" 文本。
  - 文本：保留 `<DiffViewer/>`。
- 加载态/空态文案逻辑不变。

## 不改的部分
- 后端 `adapters/git.ts` 的 `isBinary` 判定不动（语义正确，图片确实是二进制）。
- `editor.ts` 的 `openFile` / `getMediaType` 不动（已满足需求，直接复用）。
- 不新增文件、不新增依赖。

## 验收
1. 水平布局下，git changes 面板点击任意文件 → 打开新 tab；垂直/窄屏（拖窄窗口至 <480px 或移动端）下点击同样能打开 tab。
2. hover 一个 `.png/.jpg/.gif/.webp` 改动文件 → hovercard 显示图片预览；hover 二进制非图片文件（如 `.zip`）→ 仍显示 "Binary file"；hover 文本文件 → 仍显示 diff。