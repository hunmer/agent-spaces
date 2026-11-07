/**
 * SPA 占位页（原仓库对应页面不在迁移闭包内）：
 *   LoginPage    —— 原仓库 app/login/page.tsx 完整登录页未迁移；
 *                   新项目 server 免鉴权（无 auth.json 时 /api/auth/check 恒通过），
 *                   main.tsx 预置 localStorage 免登标记，此页仅作兜底。
 *   NotFoundPage —— Next 无显式 404 页，SPA 需要一个通配渲染。
 */
import { Link } from "react-router-dom";

export function LoginPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-lg font-semibold">Flow Spaces</h1>
      <p className="text-sm text-muted-foreground">
        此环境为免鉴权模式，无需登录。
      </p>
      <Link
        to="/workflows"
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
      >
        进入工作流
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-lg font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">页面不存在</p>
      <Link
        to="/workflows"
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
      >
        返回工作流列表
      </Link>
    </div>
  );
}
