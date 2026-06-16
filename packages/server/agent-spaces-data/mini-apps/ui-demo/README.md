# AgentSpacesUI 组件展示 (ui-demo)

> AgentSpacesUI 组件库的交互式展示 Demo，按 10 个分类浏览所有主流 UI 组件的用法与效果。

## 这是什么

ui-demo 是一个面向组件库的「活文档」：把 AgentSpacesUI 中的代表性组件按功能分类、逐个展示，并附带可交互的状态与说明。开发者或设计师可以用它快速了解组件能力、查看视觉效果、找到合适的用法参考。

## 10 个组件分类

| 分类 | 涵盖组件 |
| --- | --- |
| 按钮 & 开关 | Button、Toggle、ToggleGroup、CopyButton、HoldToConfirm |
| 卡片容器 | Card、Accordion、Collapsible |
| 表单输入 | Input、InputGroup、Textarea、Checkbox、Switch、Select、Slider、ColorPicker、Field |
| 对话框 / 覆盖层 | Dialog、AlertDialog、Sheet、Drawer、Popover、HoverCard |
| 导航 | Breadcrumb、Tabs、Pagination、Tooltip |
| 数据展示 | Table、Badge、ShinyBadge、Avatar、Status、Progress、Skeleton、Empty |
| 菜单 / 面板 | DropdownMenu、ContextMenu、Command |
| 布局工具 | Separator、ScrollArea、ResizablePanelGroup |
| 反馈 / 动画 | Alert、Loader、MorphingSpinner、Shimmer、BorderGlide、MovingBorder |
| 媒体展示 | Markdown、MermaidPreview |

## 怎么逛

1. 进入应用后，默认显示一个 10 个标签的顶层导航
2. 切换不同分类的标签即可查看对应组件
3. 每个组件都带有交互状态（点击、滑动、开关等）
4. 每个组件下方都有说明文字（title / subtitle / hint）解释用法
5. 内容区域使用 ScrollArea 滚动，确保长内容可顺畅浏览

## 适合谁

- **新加入的开发者**：快速了解组件库能做什么、按需取用
- **设计师**：查看实际渲染效果，确认样式与配色
- **AI 编程助手**：作为组件示例参考，写新应用时挑选合适组件
- **教学场景**：当作组件库的入门教程

## 展示亮点

- **6 种 Button variants × 3 种尺寸** 一目了然
- **Accordion 折叠面板**、**Collapsible** 等展示不同交互
- **表单全套** 输入控件可即时调节
- **Dialog / Sheet / Drawer** 多种覆盖层交互对比
- **DropdownMenu + 快捷键** 展示完整菜单能力
- **Command 命令面板** 实现类 IDE 的命令搜索
- **Markdown 完整语法** 与 **Mermaid 图表** 预览

## 设计约定

- 所有 UI 组件通过 `window.AgentSpacesUI` 全局对象访问，不使用 import
- 通用 Section 样式（title / subtitle / hint）集中在 `utils/styles.js`，确保亮色 / 暗色模式一致
- 组件文件之间使用标准 ES Module 互相引用

## 常见问题

**看不到组件效果？**
请确认运行环境已注入 `window.AgentSpacesUI` 全局对象。缺失时组件不会渲染。

**演示和真实应用效果不一致？**
ui-demo 旨在展示组件能力与样式参考，正式使用时请按需调整 props。

**想找某个组件？**
可使用浏览器的页面内查找（Ctrl/Cmd + F）按组件名快速定位。

## 版本

1.0.0
