"use client";

import "@/lib/api-polyfill";
import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated, removeToken } from "@/lib/auth";
import { tauriNavigate } from "@/lib/navigate";
import { isLoginPath, loginHrefWithRef } from "@/lib/routes";
import { getActiveServer } from "@/lib/server";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Settings } from "lucide-react";
import { sdk } from "@/lib/sdk";

type AuthState = "checking" | "error" | "ok";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const isLogin = isLoginPath(pathname);

  const checkAuth = useCallback(() => {
    if (isLogin) {
      setState("ok");
      return;
    }

    if (!isAuthenticated()) {
      tauriNavigate(router, loginHrefWithRef(), true);
      return;
    }

    setState("checking");
    sdk.auth.check()
      .then((data: any) => {
        if (data.authenticated) {
          setState("ok");
        } else {
          removeToken();
          tauriNavigate(router, loginHrefWithRef(), true);
        }
      })
      .catch(() => {
        const server = getActiveServer();
        setErrorMsg(
          server
            ? `无法连接到服务器 ${server.name} (${server.url})`
            : "无法连接到服务器"
        );
        setState("error");
      });
  }, [isLogin, router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLogin) return <>{children}</>;
  if (state === "checking") {
    return (
      <div className="flex h-[var(--app-content-height)] items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" aria-label="Loading" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex h-[var(--app-content-height)] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
          <AlertTriangle className="size-12 text-destructive" />
          <h2 className="text-lg font-semibold">连接失败</h2>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkAuth}
            >
              <RefreshCw className="size-4 mr-1" />
              重试
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                removeToken();
                tauriNavigate(router, loginHrefWithRef(), true);
              }}
            >
              <Settings className="size-4 mr-1" />
              切换服务器
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
