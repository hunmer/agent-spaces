/**
 * SPA 入口（对齐原仓库 packages/web/src/app/layout.tsx 的 Provider 树）。
 *
 * 原 Next RootLayout → SPA 等价物：
 *   <html>/<body> className        → index.html 静态类（h-[var(--app-content-height)] overflow-hidden …）
 *   ThemeProvider                  → 直接复用（闭包内原文件，非 next-themes）
 *   LocaleProvider                 → 直接复用（内部已切到 next-intl shim）
 *   AuthGuard + AppShell           → 不迁移：闭包无对应组件；免鉴权模式下以
 *                                     localStorage 预置标记 + /api/auth/check 兜底
 *   Toaster richColors bottom-right→ 保留（业务代码大量使用 sonner toast）
 *   ThemeStyleInit/CustomCursor/
 *   ViewportInsets/Deferred…       → workspace 壳组件，不在闭包内，不迁移
 *   "flexlayout-react/style/light.css" + "tippy.js/dist/tippy.css" + globals.css
 *                                  → 在此 import（对齐原 layout.tsx:11-13）
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LocaleProvider } from "@/components/layout/locale-provider";
import { AppRoutes } from "@/app/router";

import "flexlayout-react/style/light.css";
import "tippy.js/dist/tippy.css";
import "@/styles/globals.css";

// 免鉴权环境预置登录标记（lib/auth.ts isAuthenticated() 读取；
// 独立 server 数据目录无 auth.json 时接口层同样放行，双保险）
try {
  if (!localStorage.getItem("agent-spaces-auth-verified")) {
    localStorage.setItem("agent-spaces-auth-verified", "1");
  }
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <LocaleProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster richColors position="bottom-right" />
        </BrowserRouter>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
);
