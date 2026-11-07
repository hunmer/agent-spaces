/**
 * Vite/SPA 路由表（复刻 Next.js App Router 中被排除的 7 个 page.tsx 壳）。
 *
 * Next 壳 → SPA 路由的对应关系（见 MIGRATION-NOTES.md）：
 *   app/page.tsx                    → "/" 重定向到 /workflows（新项目无工作台首页）
 *   app/workflows/page.tsx          → <WorkflowsPage />
 *   app/workflows/share/page.tsx    → 该文件是完整业务页（非壳），已原样复制到 app/workflows/share/page.tsx
 *   app/workflows/[id]/page.tsx     → <WorkflowEditorPageClient />
 *   app/mini-apps/page.tsx          → <MiniAppPage />
 *   app/mini-apps/[id]/page.tsx     → <MiniAppEditorPageClient />
 *   app/mini-apps-preview/page.tsx  → <MiniAppPreviewPageClient />（query: ?id=xxx）
 *   app/mini-apps-preview/[id]/page.tsx → 同上（path 参数版本）
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { WorkflowsPage } from "@/components/workflows/workflows-page";
import { MiniAppPage } from "@/components/mini-apps/mini-apps-page";
import WorkflowEditorPageClient from "@/app/workflows/[id]/workflow-editor-page-client";
import MiniAppEditorPageClient from "@/app/mini-apps/[id]/mini-app-editor-page-client";
import MiniAppPreviewPageClient from "@/app/mini-apps-preview/[id]/preview-page-client";
import WorkflowSharePage from "@/app/workflows/share/page";
import { LoginPage, NotFoundPage } from "@/app/placeholders";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/workflows" replace />} />
      <Route path="/workflows" element={<WorkflowsPage />} />
      <Route path="/workflows/share" element={<WorkflowSharePage />} />
      <Route path="/workflows/:id" element={<WorkflowEditorPageClient />} />
      <Route path="/mini-apps" element={<MiniAppPage />} />
      <Route path="/mini-apps/:id" element={<MiniAppEditorPageClient />} />
      <Route path="/mini-apps-preview" element={<MiniAppPreviewPageClient />} />
      <Route path="/mini-apps-preview/:id" element={<MiniAppPreviewPageClient />} />
      {/* 免鉴权模式下不应到达；保留防直链 401 场景 */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
