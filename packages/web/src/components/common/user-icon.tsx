"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

const SIZES = {
  sm: "size-8 [&>svg]:size-3",
  md: "size-10 [&>svg]:size-4",
  lg: "size-12 [&>svg]:size-5",
} as const;

export interface UserIconProps {
  size?: keyof typeof SIZES;
  className?: string;
}

export function UserIcon({ size = "lg", className }: UserIconProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    setAvatarUrl(localStorage.getItem("userAvatarUrl"));

    const handler = (e: StorageEvent) => {
      if (e.key === "userAvatarUrl") setAvatarUrl(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden border border-input flex items-center justify-center shrink-0",
        SIZES[size],
        avatarUrl ? "" : "bg-muted",
        className,
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="User" className="size-full object-cover" />
      ) : (
        <User className="text-muted-foreground" />
      )}
    </div>
  );
}
