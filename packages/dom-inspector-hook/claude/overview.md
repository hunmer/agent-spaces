# DOM Inspector Hook — 概述

## 功能

捕获用户在浏览器中点击的 DOM 元素对应的源码位置（文件路径、行号、列号），POST 到配置的 URL。

## 使用场景

配合 `packages/web` 的 react-dev-inspector：
1. 开发时点击页面元素
2. code-inspector-plugin 触发 dom-inspector-hook
3. Hook POST 到 Server `/api/inspector/track`
4. Server 通过 WebSocket 广播 `inspector.jump` 事件
5. 编辑器自动跳转到对应文件和行号

## 入口

`src/index.ts` — 主逻辑
