## 实现方案:HistoryTab 增加视图切换 + 瀑布流 + 图片右键菜单

### 改动范围(单文件,刷新即生效)
仅改 `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/components/right-panel/HistoryTab.jsx`。

**零宿主改动**:`ContextMenu`、`Masonry`、图标(`LayoutGrid`/`List`/`ImageDown`/`ClipboardCopy`/`Maximize2`/`Trash2`/`Send`)都已通过 `@agent-spaces/ui`(`ui-exports.ts:28,39,91`)暴露。

### 1. 视图切换 state + 工具栏
- HistoryTab 顶部加 `viewMode` state(`'list'` | `'masonry'`),默认 `'list'`(保持现状)。
- 把现有的「清空记录」行(`HistoryTab.jsx:91-99`)升级成工具栏行,右侧放视图切换按钮组(两个图标按钮:`List` 列表 / `LayoutGrid` 瀑布流),左侧保留「清空记录」。
- 用受控的简单 button + active 高亮(不用 ToggleGroup,避免引入额外样式适配)。

### 2. 数据展平(瀑布流专用)
新增 `flatImageItems` memo:遍历 `filtered`(复用现有搜索+分类过滤逻辑),只取**图片记录**(`mediaType !== 'audio'/'video'/'text'` 且 `images.length > 0`),把每条记录的每张图展平成:
```
{ key, url, item, imgIndex, images }   // key = `${item.id}:${imgIndex}` 保证唯一(规避约束 #24 重复 URL key)
```
- 注意:沿用现有 `filtered`,搜索/分类筛选对两个视图一致生效。

### 3. 瀑布流布局(Masonry)
```
<Masonry
  data={flatImageItems}
  getKey={(it) => it.key}
  columns={3}              // 右侧面板宽度(200-400px)固定 3 列,每列 60-120px
  gap={6}
  rowHeight={80}
  enterAnimation={false}   // 关闭入场动画,避免数据量大时滚动卡顿
  exitAnimation={false}
  layoutTransition={false}
  scrollContainerRef={scrollRef}  // Masonry 监听 ScrollArea 视口(见下)
  renderItem={(it) => <MasonryImageCell ... />}
/>
```
- **关键难点:Masonry 默认监听 window 滚动**,但这里在 `ScrollArea` 内。需要给 ScrollArea 内部的滚动 DOM 传 `scrollContainerRef`。
  - 方案:`ScrollArea` 渲染时通过 ref 拿到内部 `[data-radix-scroll-area-viewport]` 元素传给 Masonry。若该 ref 取不到,回退到不传(让 Masonry 用 window,虽不完美但不报错)。
- **getMeta**:`{ aspect: '1:1' }` —— 历史图片真实宽高比未知,统一用正方形 cover 缩略图(与现有 grid 缩略图观感一致,简单可靠)。

### 4. MasonryImageCell 组件(新建,文件内)
复用 `ImageHoverCard` 做 hover 预览,内部结构:
```
<ImageHoverCard url renderTrigger={ctx => (
  <>
    <button onClick={() => openMediaGallery(...)}>  // 点击看大图
      <img src={url} className="object-cover" draggable onDragStart={...} />
    </button>
    {/* 悬浮底部按钮条(精简):用作输入 / 添加到素材库 */}
    <div className="底部居中条,hover 时 opacity-100">
      <button onClick={() => onUseImage(url)} title="用作输入"><Send/></button>
      <button onClick={() => onAddToAssets([url])} title="添加到素材库"><FolderPlus/></button>
    </div>
  </>
)} />
```

### 5. 右键菜单(全量操作)
整张图包裹 `<ContextMenu>`:
```
<ContextMenu>
  <ContextMenuTrigger render={<div>}> ... MasonryImageCell ... </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onClick={用作输入}>用作输入</ContextMenuItem>
    <ContextMenuItem onClick={添加到素材库[单图]}>添加到素材库</ContextMenuItem>
    <ContextMenuItem onClick={插入到画布[整条记录]}>插入到画布…</ContextMenuItem>  // 调 onInsertHistory(item)
    <ContextMenuItem onClick={查看大图}>查看大图</ContextMenuItem>
    <ContextMenuItem onClick={复制图片地址}>复制图片地址</ContextMenuItem>  // navigator.clipboard.writeText(url) + toast
    <ContextMenuSeparator />
    <ContextMenuItem onClick={删除整条记录}>删除该记录</ContextMenuItem>  // 调 onRemoveHistory(item.id),整条删除
  </ContextMenuContent>
</ContextMenu>
```
- **删除语义**:删除整条历史记录(非单图),与用户选择的 preview 一致;菜单项文案明确写「删除该记录」避免误操作。

### 6. 现有 HistoryImageThumb 复用
- **列表视图不改动**(保持 `HistoryCard` + `HistoryImageThumb` 原样),零回归风险。
- masonry 视图用新建的 `MasonryImageCell`,独立维护,不污染现有逻辑。

### 不做(避免范围蔓延)
- 不改 list 视图的卡片样式(约束:最小改动)。
- 不改宿主层 `react-renderer.tsx`/`ui-exports.ts`(已确认无需改)。
- 不持久化 viewMode 到 settings(本次不加,可在后续优化)。
- 不处理音频/视频/文本记录在 masonry 视图的展示(它们仍可在 list 视图查看;masonry 只展平图片)。

### 验收步骤
1. 进入 game-asset-canvas,右侧「生成记录」tab,确认默认仍是列表卡片视图。
2. 生成几条带图片的记录后,点击工具栏右上「瀑布流」图标 → 切换为 3 列正方形缩略图瀑布流。
3. 鼠标悬浮某张图:① HoverCard 大图预览(500ms 延迟);② 底部出现「用作输入/添加到素材库」两个按钮。
4. 右键某张图:弹出全量菜单(用作输入/添加到素材库/插入到画布/查看大图/复制图片地址/删除该记录),逐项点击验证生效。
5. 在搜索框输入关键词 + 切分类 chip,确认 masonry 视图也正确过滤。
6. 点击「列表」图标切回,确认卡片视图无回归。