/**
 * `next/navigation` shim（Vite + react-router-dom v7 适配层）。
 *
 * 覆盖本项目业务闭包内实际使用的全部导出：
 *   useRouter / usePathname / useSearchParams / useParams /
 *   useServerInsertedHTML / type ReadonlyURLSearchParams
 *
 * 通过 vite.config.ts 的 alias（/^next\/(.*)$/ → src/shims/next/$1）生效，
 * 业务文件零改动。差异说明见 MIGRATION-NOTES.md。
 */
import {
  isValidElement,
  useInsertionEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams as useRRParams,
  useSearchParams as useRRSearchParams,
} from "react-router-dom";

/** Next.js 类型层面的只读 searchParams；运行时是原生 URLSearchParams（业务代码存在 .set/.delete 后 toString 的用法） */
export type ReadonlyURLSearchParams = URLSearchParams;

export interface NavigateOptions {
  scroll?: boolean;
}

/** Next.js `AppRouterInstance` 的浏览器端子集（业务代码只调用 push/replace/back） */
export interface AppRouterInstance {
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
  back: () => void;
  forward: () => void;
  /** SPA 内无 server component 刷新；退化为整页 reload（业务代码未使用） */
  refresh: () => void;
  /** 客户端路由无需预取（空实现） */
  prefetch: (href: string) => void;
}

export function useRouter(): AppRouterInstance {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      // Next scroll:false ≈ react-router preventScrollReset:true；其余取默认行为
      push: (href, options) =>
        navigate(href, { preventScrollReset: options?.scroll === false }),
      replace: (href, options) =>
        navigate(href, {
          replace: true,
          preventScrollReset: options?.scroll === false,
        }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => window.location.reload(),
      prefetch: () => {},
    }),
    [navigate],
  );
}

/** Next 语义：pathname 不带末尾斜杠（根路径除外） */
export function usePathname(): string {
  const { pathname } = useLocation();
  return pathname !== "/" && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * 返回当前 location.search 的 URLSearchParams 实例。
 * 直接 mutate 不回写地址栏（与 Next 行为一致）；业务代码的用法是
 * set/delete 后 toString() 拼新 query 再交给 router.replace。
 */
export function useSearchParams(): ReadonlyURLSearchParams {
  const [searchParams] = useRRSearchParams();
  return searchParams as unknown as ReadonlyURLSearchParams;
}

/**
 * Next 语义：动态路由段必有值（如 /workflows/:id 的 id）。
 * react-router 未匹配时为 undefined，这里统一成空串以贴近 Next 运行时。
 */
export function useParams<
  T extends Record<string, string | undefined> = Record<string, string>,
>(): T {
  const params = useRRParams();
  const result: Record<string, string> = {};
  for (const key of Object.keys(params)) {
    result[key] = params[key] ?? "";
  }
  return result as T;
}

/**
 * 客户端版 useServerInsertedHTML：
 * 原项目在 SSR 期间用它向 <head> 注入防 FOUC 内联脚本（theme-provider /
 * locale-provider）。纯 SPA 下没有 SSR，改为首次挂载时通过 useInsertionEffect
 * （先于所有 layout effect / paint）把回调返回的元素注入 document.head，
 * 复刻“渲染前执行”的效果。仅支持返回 <script dangerouslySetInnerHTML> 或
 * 字符串 children 的用法（本项目两处调用均为前者）。
 */
export function useServerInsertedHTML(callback: () => ReactNode): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useInsertionEffect(() => {
    const node = callbackRef.current();
    if (!isValidElement(node)) return;

    const key = String((node as { key?: React.Key | null }).key ?? "");
    const dedupeSelector = key
      ? `script[data-next-shim="${key.replace(/"/g, '\\"')}"]`
      : null;
    if (dedupeSelector && document.head.querySelector(dedupeSelector)) return;

    const props = node.props as {
      dangerouslySetInnerHTML?: { __html: string };
      children?: unknown;
    };

    const tag = typeof node.type === "string" ? node.type : "script";
    const element = document.createElement(tag);
    if (props.dangerouslySetInnerHTML) {
      element.textContent = props.dangerouslySetInnerHTML.__html;
    } else if (typeof props.children === "string") {
      element.textContent = props.children;
    } else {
      return;
    }
    if (key) element.dataset.nextShim = key;
    document.head.appendChild(element);
  }, []);
}
