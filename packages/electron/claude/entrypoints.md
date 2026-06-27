# Electron 模块 — 入口与启动

## 命令

```bash
pnpm --filter @agent-spaces/electron dev      # 开发（需先启动 Web dev）
pnpm --filter @agent-spaces/electron build      # 编译
pnpm --filter @agent-spaces/electron dist       # 打包
pnpm --filter @agent-spaces/electron dist:mac   # macOS
pnpm --filter @agent-spaces/electron dist:win   # Windows
pnpm --filter @agent-spaces/electron dist:linux # Linux
```

## 启动流程

1. 创建 BrowserWindow（1280x800，沙箱关闭）
2. 开发态加载 `http://127.0.0.1:3000`
3. 生产态启动本地 HTTP 服务 → 加载 `renderer/` 静态导出
4. 注册 `app://` 和 `local://` 协议
5. 注册 IPC 处理器（文件系统、快捷键、插件）
6. 注册 F12/Ctrl+Shift+I DevTools 快捷键
