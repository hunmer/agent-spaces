# Electron 模块 — 文件索引

```
packages/electron/
├── CLAUDE.md
├── claude/
├── package.json
├── main.ts                    # 主进程入口
├── ipc/
│   ├── shortcut.ts            # 全局快捷键
│   └── fs.ts                  # 文件系统 IPC
├── preload/
│   └── index.ts              # 预加载脚本
├── services/
│   ├── store.ts              # electron-store
│   └── client-plugin-runner.ts
├── utils/
├── build/
│   └── icon.png              # 应用图标
└── renderer/                  # Web 静态导出（构建时复制）
```
