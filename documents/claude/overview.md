# Documents — 概述

## 结构

```
documents/
├── docusaurus.config.ts     # Docusaurus 配置
├── sidebars.ts             # 侧边栏配置
├── blog/
│   ├── authors.yml          # 博客作者
│   └── tags.yml             # 博客标签
└── src/
    ├── components/          # 自定义组件
    └── pages/               # 页面
```

## 命令

```bash
pnpm --filter documents start   # 开发 :3001
pnpm --filter documents build  # 构建
```
