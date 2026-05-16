"use client";

import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import { useUserAvatar } from "@/hooks/use-user-avatar";
import { resolveServerAssetUrl } from "@/lib/server";

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
  const avatarUrl = useUserAvatar();
  const src = resolveServerAssetUrl(avatarUrl);

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden border border-input flex items-center justify-center shrink-0",
        SIZES[size],
        src ? "" : "bg-muted",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="User" className="size-full object-cover" />
      ) : (
        <User className="text-muted-foreground" />
      )}
    </div>
  );
}
