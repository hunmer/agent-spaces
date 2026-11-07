/**
 * `next/link` shim：转发到 react-router-dom 的 Link（href → to）。
 *
 * 当前业务闭包内没有 next/link 使用者（原仓库仅 app/setup/page.tsx 使用，
 * 该页面不在迁移范围），本文件保证类型可用，供后续扩展。
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as RRouterLink } from "react-router-dom";

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  /** Next Link 用 href；react-router 用 to */
  href: string;
  replace?: boolean;
  /** 客户端路由无预取，仅为类型兼容 */
  prefetch?: boolean | null;
  scroll?: boolean | null;
  children?: ReactNode;
}

export default function Link({
  href,
  replace,
  prefetch: _prefetch,
  scroll: _scroll,
  ...rest
}: LinkProps) {
  return <RRouterLink to={href} replace={replace} {...rest} />;
}
