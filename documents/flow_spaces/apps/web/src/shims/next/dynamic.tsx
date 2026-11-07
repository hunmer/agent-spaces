/**
 * `next/dynamic` shim：React.lazy + Suspense 的简化版。
 *
 * 业务闭包内的两种用法（均为客户端组件，ssr:false 在 SPA 下无意义）：
 *   1. dynamic<EditorProps>(() => import("@monaco-editor/react").then(m => m.default), { ssr:false, loading })
 *   2. dynamic(() => import("@/components/teams/team-chat-panel").then(m => m.TeamChatPanel), { ssr:false })
 * loader 可能 resolve 出组件本身或 ES module（取 .default），两者都归一到
 * React.lazy 需要的 { default: ComponentType } 形态。
 */
import {
  lazy,
  Suspense,
  type ComponentType,
  type ReactNode,
} from "react";

export interface DynamicOptions<P = Record<string, unknown>> {
  /** SPA 无 SSR，此开关仅为兼容保留 */
  ssr?: boolean;
  loading?: ComponentType<P> | (() => ReactNode);
}

type LoaderComponent<P> =
  | ComponentType<P>
  | { default: ComponentType<P> };

export default function dynamic<P = Record<string, never>>(
  loader: () => Promise<LoaderComponent<P>>,
  options?: DynamicOptions<P>,
): ComponentType<P> {
  const LazyComponent = lazy(async () => {
    const loaded = await loader();
    if (
      loaded &&
      typeof loaded === "object" &&
      "default" in loaded
    ) {
      return loaded as { default: ComponentType<P> };
    }
    return { default: loaded as ComponentType<P> };
  }) as ComponentType<P>;

  const Loading = options?.loading as
    | ComponentType<Record<string, never>>
    | undefined;
  const fallback = Loading ? (
    <Loading />
  ) : null;

  function DynamicComponent(props: P) {
    const RestoredLazy = LazyComponent as ComponentType<
      Record<string, unknown>
    >;
    return (
      <Suspense fallback={fallback}>
        <RestoredLazy {...(props as Record<string, unknown>)} />
      </Suspense>
    );
  }

  return DynamicComponent as ComponentType<P>;
}
