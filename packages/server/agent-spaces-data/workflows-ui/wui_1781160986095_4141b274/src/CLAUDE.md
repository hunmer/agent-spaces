# AgentSpacesUI 组件展示 Demo

## 项目概述

这是一个 AgentSpacesUI 组件库的展示 Demo，通过选项卡分类展示 237 个组件中具有代表性的各类 UI 组件。每个分类使用独立的组件文件编写。

## 技术栈

- React（Workflow UI React 模式）
- AgentSpacesUI 组件库（通过 `window.AgentSpacesUI` 全局对象访问）

## 文件结构

```
src/
├── index.jsx                        # 入口文件，选项卡布局整合所有展示
├── components/
│   ├── ButtonDemo.jsx               # 按钮 & 开关: Button, Toggle, ToggleGroup, CopyButton, HoldToConfirm
│   ├── CardDemo.jsx                 # 卡片容器: Card, Accordion, Collapsible
│   ├── FormDemo.jsx                 # 表单输入: Input, InputGroup, Textarea, Checkbox, Switch, Select, Slider, ColorPicker, Field
│   ├── DialogDemo.jsx               # 对话框/覆盖层: Dialog, AlertDialog, Sheet, Drawer, Popover, HoverCard
│   ├── NavigationDemo.jsx           # 导航组件: Breadcrumb, Tabs, Pagination, Tooltip
│   ├── DataDisplayDemo.jsx          # 数据展示: Table, Badge, ShinyBadge, Avatar, Status, Progress, Skeleton, Empty
│   ├── MenuDemo.jsx                 # 菜单/面板: DropdownMenu, ContextMenu, Command
│   ├── LayoutDemo.jsx               # 布局工具: Separator, ScrollArea, ResizablePanelGroup
│   ├── AlertDemo.jsx                # 反馈/动画: Alert, Loader, MorphingSpinner, Shimmer, BorderGlide, MovingBorder
│   └── MediaDemo.jsx                # 媒体展示: Markdown, MermaidPreview
├── utils/
│   └── styles.js                    # 共享展示样式（section、title、subtitle、hint）
└── CLAUDE.md                        # 项目说明文档
```

## 设计决策

1. **分类策略**: 按组件功能分为 10 个类别，每个类别一个独立文件
2. **交互式展示**: 每个组件都有交互状态和说明提示，方便理解用法
3. **入口整合**: 使用 Tabs 组件作为顶层导航，ScrollArea 确保内容可滚动
4. **全局对象**: 所有 UI 组件通过 `window.AgentSpacesUI` 解构获取，不使用 import
5. **文件引用**: 组件文件之间使用标准 ES Module import 语法
6. **共享样式**: 通用 Section 样式（title/subtitle/hint）集中定义在 `utils/styles.js`，通过 spread 合并到各组件的局部样式中，确保亮色/暗色模式一致性

## 组件覆盖范围

| 分类文件 | 展示的主要组件 |
|---------|--------------|
| ButtonDemo | Button (6 variants + 3 sizes), Toggle, ToggleGroup, CopyButton, HoldToConfirm |
| CardDemo | Card (3 样式), Accordion (3 项), Collapsible |
| FormDemo | Input, InputGroup, Textarea, Checkbox, Switch, Select, Slider, ColorPicker, Field |
| DialogDemo | Dialog, AlertDialog, Sheet, Drawer, Popover, HoverCard |
| NavigationDemo | Breadcrumb, Tabs, Pagination (5 页), Tooltip (4 图标) |
| DataDisplayDemo | Badge, ShinyBadge, Avatar/AvatarGroup, Status, Progress, Skeleton, Empty, Table |
| MenuDemo | DropdownMenu (含快捷键), ContextMenu, Command (命令面板) |
| LayoutDemo | Separator (水平/垂直), ScrollArea, ResizablePanelGroup |
| AlertDemo | Alert (2 variants), Loader, MorphingSpinner, Shimmer, BorderGlide, MovingBorder |
| MediaDemo | Markdown (完整语法), MermaidPreview (2 种图表) |
