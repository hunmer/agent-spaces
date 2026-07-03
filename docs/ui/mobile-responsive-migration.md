# 迁移到小屏幕 UI 的经验

记录把桌面端三栏 / 多按钮布局改造为响应式（小屏 Drawer / Dropdown / 纯图标）过程中踩过的坑与可复用模式。所有断点统一用 `md`（<768px）。

## 基础设施：useIsMobile

项目已有现成 hook：[use-mobile.ts](../../packages/web/src/hooks/use-mobile.ts)。

```ts
// 断点 768，<768 返回 true；SSR 安全（首帧返回 false，避免 hydration 不匹配）
const isMobile = useIsMobile();
```

要点：
- **断点与 Tailwind 对齐**：`useIsMobile()` 的 `<768` 等价于 Tailwind 的 `md:` 前缀边界。JS 判断（`isMobile ? A : B`）和 CSS 类（`md:hidden` / `hidden md:inline`）可以无缝搭配。
- **不要重复造轮子**：不要再 `useState + matchMedia` 自己写一遍，已有 hook 已处理 SSR 和 change 监听。
- **CSS 优先，JS 兜底**：单纯显隐用 Tailwind 响应式类（`hidden md:inline`）；需要**结构不同**（如换组件、抽变量复用）才用 `isMobile` 分支。

---

## 模式一：多栏布局 → 小屏 Drawer

适用：桌面是 `ResizablePanelGroup` 或 flexlayout 的三栏，小屏要侧边栏改抽屉。

### 关键：把面板内容抽成共享变量

桌面和小屏的左右面板内容完全相同，**不要复制粘贴两份 JSX**。把每个面板抽成变量，两种布局共用：

```tsx
// ✅ 抽成变量，桌面三栏和小屏 Drawer 共用
const agentListPanel = <ChatAgentList {...props} onSelectSession={(id) => {
  handleSelectSession(id);
  setLeftDrawerOpen(false);  // 小屏选完自动关
}} />;

const chatMainPanel = <div className="...">{/* 中间内容 */}</div>;

const rightPanel = <ChatRightPanel {...props} onFileSelect={(p) => {
  handleFileSelect(p);
  setRightDrawerOpen(false);
}} />;

const dialogs = <>{/* 多个 Dialog，两端共用，避免重复 */}</>;

if (isMobile) {
  return (
    <div className="relative h-full p-2">
      {chatMainPanel}
      {/* 边缘圆形按钮：始终可见，含空状态 */}
      <Button className="absolute top-1/2 left-0 -translate-y-1/2 ..." onClick={() => setLeftDrawerOpen(true)}>
        <PanelLeft />
      </Button>
      <Drawer open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen} direction="left">
        <DrawerContent className="h-full w-4/5 max-w-sm p-2">{agentListPanel}</DrawerContent>
      </Drawer>
      {dialogs}
    </div>
  );
}

return <ResizablePanelGroup ...>{/* 桌面原样 */}{dialogs}</ResizablePanelGroup>;
```

### 坑：Dialog 块要抽出来两端共用

多栏布局里通常带一堆 Dialog（新建、编辑、确认等）。**必须抽成 `dialogs` 变量**，桌面和小屏两个分支都引用同一份。否则要么漏掉（小屏打不开某弹窗），要么重复挂载（同一个 Dialog 在 DOM 里出现两次）。

参考实现：[chat/page.tsx](../../packages/web/src/app/chat/page.tsx)。

### 坑：切换按钮的位置决定可用性

「边缘圆形按钮」放容器边缘、`absolute top-1/2` 垂直居中。关键是要**始终可见**（包括空状态 / 文件预览 / 聊天中），否则用户在小屏空状态下无法打开左侧抽屉选会话。

如果按钮只在「选中会话」时显示（如放在子组件 header 里），空状态就成了死胡同。

---

## 模式二：flexlayout tabset → 小屏 Drawer + Tabs

适用：桌面用 `flexlayout-react` 的 `Layout`（三 tabset），小屏要把左右 tabset 改抽屉。

### 关键：factory 的 switch 体抽成 renderTab 函数

flexlayout 的 `factory` 是个 `useCallback`，里面 switch 每个 tab 组件。**把 switch 体抽成普通函数 `renderTab(comp)`**，桌面 `factory` 调用它，小屏 Drawer 也调用它，零重复：

```tsx
// ✅ 抽成普通函数（非 useCallback），闭包访问所有 state
const renderTab = (comp: string) => {
  const workflow = state.workflow;
  if (!workflow) return null;
  switch (comp) {
    case 'node-sidebar': return <WorkflowNodeSidebar ... />;
    case 'canvas': return <WorkflowCanvas ... />;
    // ...
  }
};

// factory 调用 renderTab（注意 node.getComponent() 返回 string | undefined）
const factory = useCallback(
  (node: TabNode) => renderTab(node.getComponent() ?? ''),
  [/* 原依赖不变 */],
);
```

小屏下中间只渲染 Canvas，左右 Drawer 用 `Tabs` 承载多个 tab：

```tsx
{isMobile ? (
  <>
    <div className="h-full w-full overflow-hidden">{renderTab('canvas')}</div>
    <Drawer direction="left" ...>
      <DrawerContent className="h-full w-4/5 max-w-sm p-0">
        <Tabs value={leftTab} onValueChange={setLeftTab} className="flex h-full flex-col">
          <TabsList className="w-full justify-start border-b">
            <TabsTrigger value="node-sidebar"><Waypoints size={16} />Nodes</TabsTrigger>
            {/* ... */}
          </TabsList>
          <TabsContent value="node-sidebar" className="min-h-0 flex-1 overflow-auto">
            {renderTab('node-sidebar')}
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  </>
) : (
  <Layout model={model} factory={factory} onRenderTab={onRenderTab} onModelChange={onModelChange} />
)}
```

### 坑：factory 的 eslint exhaustive-deps

`renderTab` 是每次 render 重建的普通函数，`factory` 的依赖数组里没有它，会触发 `react-hooks/exhaustive-deps` 警告。加一行注释禁用即可（factory 通过闭包捕获最新 renderTab，行为正确）：

```tsx
// eslint-disable-next-line react-hooks/exhaustive-deps
const factory = useCallback((node) => renderTab(node.getComponent() ?? ''), [...]);
```

### 坑：Menubar 只在大屏渲染时，trigger 不要再用 md:hidden 图标

如果整个 `Menubar` 已经包在 `{!isMobile && (...)}` 里，那它只在 ≥768px 渲染。此时 trigger 里写 `md:hidden` 的图标**永远不会显示**（≥768px 时 `md:hidden` 生效隐藏图标）。应恢复纯文字 trigger。

参考实现：[workflow-editor.tsx](../../packages/web/src/components/workflow/workflow-editor.tsx)。

---

## 模式三：密集工具栏 → 小屏收进单个 Dropdown

适用：toolbar 有大量文字按钮，小屏放不下。

### 方案：只留标题 + 一个 dots

```tsx
{workflow && (
  <button className="... truncate" onClick={() => setInfoOpen(true)}>
    {workflow.name}{isDirty && <span className="bg-orange-500" />}
  </button>
)}

{isMobile ? (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button className="ml-auto" size="icon" />}>
      <MoreVertical />
    </DropdownMenuTrigger>
    <DropdownMenuContent className="max-h-[80vh] overflow-y-auto" align="end">
      {/* 用 DropdownMenuSeparator 分组，收纳全部功能 */}
      <DropdownMenuItem onClick={onSave}>...</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>...</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
) : (
  <>{/* 桌面：原 Menubar + 文字按钮 */}</>
)}
```

### 坑：共用 Dialog 要放到 isMobile 分支之外

`exitConfirm` / `savePreview` / `clearNodes` 等 Dialog 在桌面和小屏都会被触发（桌面按钮、小屏 Dropdown 项都调同一个 `setXxxOpen(true)`）。**必须放到 `{isMobile ? ... : ...}` 之外**，两端共用一份。放错位置会导致某一端弹不出来，或两端各挂一份。

参考实现：[workflow-editor-toolbar.tsx](../../packages/web/src/components/workflow/workflow-editor-toolbar.tsx)。

---

## 模式四：次要文字 → 小屏纯图标

适用：一行多个「图标+文字」按钮，小屏只想留图标。

最简单，给文本 `<span>` 加响应式类即可，无需 `isMobile`：

```tsx
<Button variant="ghost" size="sm">
  <IconPlug className="size-3" />
  {/* 文字和数量徽标在小屏隐藏，图标始终保留 */}
  <span className="hidden md:inline">{t('input.mcp')}{mcps.length ? ` ${mcps.length}` : ''}</span>
  <IconChevronDown className="size-3" />
</Button>
```

参考实现：[chat-input-info-bar.tsx](../../packages/web/src/components/chat/chat-input-info-bar.tsx)。

---

## 模式五（反面教材）：固定尺寸浮动组件不要内部塞 Dialog

适用：如 `FloatingChatPanel` 这类 `fixed bottom-right` + 固定 width/height 的浮动组件。

### 坑：在组件内部用 Dialog 包裹，尺寸会失控

错误尝试：小屏时在 `FloatingChatPanel` **内部**把 `ChatPanel` 包进 `<Dialog><DialogContent className="h-[100dvh] w-full">`。问题是 `ChatPanel` 内部对固定 `width/height` 有硬约束，被全屏容器强制铺满后尺寸混乱。

### 正确做法：组件只暴露状态，由调用方决定展示方式

浮动组件应**通知调用方**「小屏需要 Dialog 展示」，由**外部调用方**用 Dialog 包裹整个组件逻辑，而不是组件内部自作主张。即：组件保持单一职责（浮动定位 + 显隐），响应式切换由消费侧控制。

> 当前 `floating-chat-widget.tsx` 的内部 Dialog 方案是反面教材，待迁移为「调用方外部 Dialog」模式。

---

## 专题：`inline-chat-panel.tsx` 的高度溢出坑

适用：聊天面板、编辑器面板、日志面板这类「固定头部 + 可滚动内容 + 固定底部输入区」的纵向布局。

### 现象：消息区一滚动，底部 info-bar 被挤掉

在小屏下，`inline-chat-panel.tsx` 的消息区域内容变多后出现滚动条，但滚动没有被限制在消息区内部，而是把整个聊天面板撑高。结果是底部输入框和 `ChatInputInfoBar` 被挤到可视区域外。

DevTools 里常见信号：

- 选中的聊天主面板高度接近整屏，例如 `398 x 880`。
- 但它本来还要放在外层页面、边距、header 或 resizable panel 内，实际可用高度小于整屏。
- 消息区有 `overflow-y-auto`，但父级仍被内容撑开。

### 根因：只给滚动区 `overflow-y-auto` 不够

在 flex column 布局里，滚动区要真正滚动，整条父链都必须允许它收缩。只在消息区写：

```tsx
<div className="flex-1 overflow-y-auto">...</div>
```

不一定生效，因为 flex item 默认 `min-height: auto`，会按内容高度撑开父容器。父容器没有 `min-h-0` / `overflow-hidden` 时，浏览器会优先扩大面板，而不是让消息区内部滚动。

### 正确约束链：每一层都要能收缩

从外到内至少需要这几层约束：

```tsx
// app/chat/page.tsx
<ResizablePanel className="min-w-0 overflow-hidden">
  <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
    <div className="min-h-0 flex-1 overflow-hidden">
      <InlineChatPanel />
    </div>
  </div>
</ResizablePanel>
```

`inline-chat-panel.tsx` 内部：

```tsx
<div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
  <div className="shrink-0">Header</div>

  <div className="min-h-0 flex-1 overflow-y-auto">
    Messages
  </div>

  <div className="shrink-0">
    <ChatComposerInput />
    <ChatInputInfoBar />
  </div>
</div>
```

要点：

- 根容器：`h-full min-h-0 overflow-hidden`。
- 中间滚动区：`min-h-0 flex-1 overflow-y-auto`。
- 顶部和底部固定区：`shrink-0`。
- 外层 flex/resizable 容器：也要有 `min-h-0` 或 `overflow-hidden`，否则内部修了也会被父层撑开。

### 小屏额外坑：`h-full` 不是剩余高度

移动端分支如果写：

```tsx
<div className="relative h-full p-2">
  {chatMainPanel}
</div>
```

而 `chatMainPanel` 自己也是 `h-full`，它可能按父容器整高渲染，再叠加外层 padding、边栏按钮等，最后出现超高。移动端主容器更稳的写法是：

```tsx
<div className="relative flex h-full min-h-0 flex-col overflow-hidden p-2">
  {chatMainPanel}
</div>
```

并让 `chatMainPanel` 同时具备 `flex-1 min-h-0 overflow-hidden`，让它吃剩余空间，而不是无限按内容长高。

### 验收方法

1. DevTools 切到 iPhone XR 或 414px 宽度。
2. 打开有大量消息的 inline chat。
3. 选中 `InlineChatPanel` 根节点，确认高度不超过外层聊天区域。
4. 选中消息区，确认滚动发生在消息区本身。
5. 确认底部 `ChatComposerInput` 和 `ChatInputInfoBar` 始终可见。

---

## 通用教训

1. **抽变量复用，不要复制 JSX**：响应式改造最大的陷阱是为了两端各写一份，导致后续改一处忘改另一处。凡是「内容相同、容器不同」的，一律抽成变量/函数共用。
2. **Dialog 等副作用组件必须在分支之外**：它们由按钮/Dropdown 项触发，两端都要能用，放对位置避免重复或遗漏。
3. **先查现成工具**：`useIsMobile`、`Drawer`、`DropdownMenu`、`Tabs` 项目都有封装，别自己造。
4. **CSS 优先于 JS**：纯显隐用 `hidden md:inline`，结构变化才用 `isMobile` 分支。少一个 hook 调用就少一次重渲染。
5. **断点统一 `md`（768px）**：JS 判断、CSS 类、`useIsMobile` 三者必须用同一断点，否则会出现「屏幕某个宽度区间布局错乱」。
6. **注意 flex 收缩和高度父链**：在「固定头部 + 可滚动中间 + 固定底部」的纵向布局里，头部/底部要 `shrink-0`，滚动区要 `min-h-0 flex-1 overflow-y-auto`，父链要 `min-h-0` 或 `overflow-hidden`。只给滚动区 `overflow-y-auto` 不够。典型场景：消息列表撑高后底部 `ChatInputInfoBar` 消失。参考上面的 `inline-chat-panel.tsx` 专题。更完整的 flex 滚动问题见 [fix-flex-overflow-scroll.md](../skills/fix-flex-overflow-scroll.md)。
