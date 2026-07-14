---
name: fix-flex-overflow-scroll
description: 修复 Flex 布局中 overflow-y-auto / overflow-auto 不生效（内容溢出但没有滚动条）的问题
trigger: 用户报告某个区域"不能滚动"、"没有滚动条"、"滚动条不出现"、"overflow 不生效"、"内容溢出"、"列表被截断"
---

# 修复 Flex 布局 Overflow 滚动失效

## 适用场景

元素已经加了 `overflow-y-auto` / `overflow-auto`，但内容超出时仍然没有滚动条，常见于：

- Dialog / Sheet 内部内容区
- Sidebar / Navigation 列表
- Header + Content + Footer 的纵向布局
- 嵌套 `flex` / `flex-col` 容器
- 折叠态、移动端、状态变体下的滚动失效

## 核心判断

`overflow-y-auto` 只有在元素拥有**明确且被约束的高度**时才会生效。

在 Flex 布局中，滚动失效通常不是滚动元素自身的问题，而是它上游的高度约束链断了，或者后续 class 把 `overflow` 覆盖了。

## 修复原则

从滚动元素往上逐层检查：

1. 滚动元素自身要有 `overflow-y-auto` / `overflow-auto`。
2. 滚动元素自身要有高度约束，例如 `flex-1 min-h-0`、`h-*`、`max-h-*`。
3. 每一层纵向 Flex 容器都要能裁剪溢出，通常需要 `flex flex-col overflow-hidden`。
4. Header / Footer / Toolbar 这类固定区域要加 `shrink-0`。
5. 中间包裹层如果承载 `flex-1`，也必须是能继续传递高度约束的 Flex 容器。
6. 检查组件库默认 class、状态变体、响应式变体是否覆盖了滚动，例如 `group-data-[collapsible=icon]:overflow-hidden`。

## 标准结构

```tsx
<div className="flex h-full flex-col overflow-hidden">
  <Header className="shrink-0" />

  <div className="min-h-0 flex-1 overflow-y-auto">
    {/* scrollable content */}
  </div>

  <Footer className="shrink-0" />
</div>
```

关键点：

- 外层：`flex flex-col overflow-hidden`
- 固定区：`shrink-0`
- 滚动区：`min-h-0 flex-1 overflow-y-auto`

## 常见断裂模式

### 模式 A：中间层不是 Flex 容器

`flex-1` / `min-h-0` 不会自动向下传递高度约束。如果中间层只是普通 `div`，子层的 `flex-1` 可能无效。

```tsx
<DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
  <Header className="shrink-0" />

  <div className="min-h-0 flex-1">
    <div className="flex min-h-0 flex-1">
      <div className="overflow-y-auto" />
    </div>
  </div>
</DialogContent>
```

修复：

```diff
- <div className="min-h-0 flex-1">
+ <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
```

### 模式 B：父级 Flex 容器缺少 overflow-hidden

即使滚动区有 `flex-1 min-h-0 overflow-y-auto`，父级如果不裁剪，内容仍可能撑破容器。

```diff
- <div className="flex size-full flex-col">
+ <div className="flex size-full flex-col overflow-hidden">
```

同时固定区域需要避免被压缩：

```diff
- <Header />
+ <Header className="shrink-0" />

- <Footer />
+ <Footer className="shrink-0" />
```

### 模式 C：状态变体覆盖了 overflow

组件库或底层组件可能带有状态 class，在特定状态下覆盖滚动，例如折叠侧边栏：

```tsx
className="flex min-h-0 flex-1 flex-col overflow-auto group-data-[collapsible=icon]:overflow-hidden"
```

如果业务要求折叠态也能滚动，需要在调用处显式覆盖同一状态变体：

```diff
<SidebarContent
-  className="overflow-y-auto"
+  className="min-h-0 overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto"
/>
```

注意：使用 `tailwind-merge` / `cn` 时，后传入的同类 class 通常会覆盖前面的 class。需要确认调用处 class 是否在底层默认 class 之后合并。

### 模式 D：组件外层不是实际滚动节点

`ScrollArea` 等封装组件通常包含 Root 和内部 Viewport。高度可能加在 Root 上，但真正负责滚动的 Viewport 没有获得确定高度，结果是内容直接越界、滚动条不出现。

先在 DevTools 中确认 `scrollHeight > clientHeight` 的节点是否同时拥有高度约束和 `overflow-y: auto`。如果当前场景不需要自定义滚动条，最小修复是让原生滚动节点直接承担高度和 overflow：

```diff
- <ScrollArea className="h-[min(68vh,720px)]">
+ <div className="h-[min(68vh,720px)] overflow-y-auto">
    ...
- </ScrollArea>
+ </div>
```

如果必须使用封装组件，则需要同时约束 Root 和其内部 Viewport，具体 class 应加到组件提供的 `viewportClassName` 等属性上。

## 排查清单

按顺序检查，避免靠猜：

1. 滚动元素是否真的命中到 DOM？开发者工具中查看 computed `overflow-y`。
2. 滚动元素是否有被约束的高度？查看 computed `height` / `max-height`。
3. 滚动元素是否是 Flex 子项？如果是，是否有 `min-h-0`？
4. 父级 `flex-col` 是否有 `overflow-hidden`？
5. Header / Footer 是否有 `shrink-0`？
6. 中间是否有普通 `div` 断开了 `flex-1` 的高度约束链？
7. 是否有响应式或状态变体覆盖了 `overflow`？
8. 是否被 `overflow-hidden` 加在了错误层级，导致滚动条被裁掉？
9. 使用 `ScrollArea` 等封装组件时，Root 和实际滚动的 Viewport 是否是同一节点？

## 快速修复模板

### Dialog / Sheet

```diff
- <DialogContent className="max-h-[85vh] flex flex-col">
+ <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden">
    <Header className="shrink-0" />

-   <div className="flex-1">
+   <div className="min-h-0 flex-1 overflow-y-auto">
      ...
    </div>
  </DialogContent>
```

### Sidebar

```diff
  <Sidebar className="overflow-hidden">
-   <SidebarHeader>
+   <SidebarHeader className="shrink-0">
      ...
    </SidebarHeader>

-   <SidebarContent className="overflow-y-auto">
+   <SidebarContent className="min-h-0 overflow-y-auto">
      ...
    </SidebarContent>

-   <SidebarFooter>
+   <SidebarFooter className="shrink-0">
      ...
    </SidebarFooter>
  </Sidebar>
```

如果底层组件在折叠态写了 `overflow-hidden`：

```diff
- <SidebarContent className="min-h-0 overflow-y-auto">
+ <SidebarContent className="min-h-0 overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto">
```

## 常见修复映射

| 场景 | 最小修复 |
| --- | --- |
| Dialog 内容不滚动 | 外层 `flex flex-col overflow-hidden`，内容区 `min-h-0 flex-1 overflow-y-auto` |
| Header/Footer 挤压内容 | Header/Footer 加 `shrink-0` |
| Sidebar 列表被截断 | Sidebar 外层裁剪，Content 加 `min-h-0 overflow-y-auto` |
| 折叠态不滚动 | 检查并覆盖状态变体中的 `overflow-hidden` |
| 嵌套 Flex 中间层断裂 | 中间层加 `flex flex-col overflow-hidden` |
| fixed/h-screen 容器内不滚动 | 根容器使用 `h-dvh` / `h-screen` + `overflow-hidden` |
| 自定义 ScrollArea 内容越界 | 约束内部 Viewport，或改用同一节点上的原生 `overflow-y-auto` |

## 验证步骤

1. 构造足够多的内容，让滚动区明显超出可视高度。
2. 缩小窗口高度，确认只有目标内容区滚动。
3. 确认 Header / Footer 不被压缩、不被滚走。
4. 切换相关状态，例如展开/折叠、移动端/桌面端、Dialog 打开/关闭。
5. 在 DevTools 中确认最终生效的 `overflow-y` 是 `auto` 或 `scroll`，不是被状态 class 改成 `hidden`。

## 已验证案例

### App Sidebar 底部按钮列表被截断

问题：`SidebarContent` 已有 `overflow-y-auto`，但折叠 icon 模式下底部按钮列表被截断仍不出现滚动条。

原因：底层 `SidebarContent` 默认包含 `group-data-[collapsible=icon]:overflow-hidden`，折叠态覆盖了调用处的普通 `overflow-y-auto`。

修复：

```diff
<Sidebar
  variant="floating"
  collapsible="icon"
- className={cn(isWorkspace && "...")}
+ className={cn("overflow-hidden", isWorkspace && "...")}
>
- <SidebarHeader className="flex ...">
+ <SidebarHeader className="flex shrink-0 ...">
    ...
  </SidebarHeader>

- <SidebarContent className="overflow-y-auto ...">
+ <SidebarContent className="min-h-0 overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto ...">
    ...
  </SidebarContent>

- <SidebarFooter className="...">
+ <SidebarFooter className="shrink-0 ...">
    ...
  </SidebarFooter>
</Sidebar>
```
