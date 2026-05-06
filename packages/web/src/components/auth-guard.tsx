"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated, getToken } from "@/lib/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === "/login") {
      setChecked(true);
      return;
    }

    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    const token = getToken();
    fetch("/api/auth/check", {
      headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setChecked(true);
        } else {
          router.replace("/login");
        }
      })
      .catch(() => router.replace("/login"));
  }, [pathname, router]);

  if (pathname === "/login") return <>{children}</>;
  if (!checked) return null;

  return <>{children}</>;
}
