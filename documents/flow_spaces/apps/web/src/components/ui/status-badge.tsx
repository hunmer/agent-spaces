"use client"

import type { ComponentProps, HTMLAttributes } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatusProps = ComponentProps<typeof Badge> & {
  status: "online" | "offline" | "maintenance" | "degraded"
}

export const Status = ({ className, status, ...props }: StatusProps) => (
  <Badge
    className={cn("flex items-center gap-2", "group", status, className)}
    variant="secondary"
    {...(props as ComponentProps<typeof Badge>)}
  />
)

export const StatusIndicator = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("relative flex h-2 w-2", className)} {...props}>
    <span
      className={cn(
        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
        "group-[.online]:bg-emerald-500",
        "group-[.offline]:bg-red-500",
        "group-[.maintenance]:bg-blue-500",
        "group-[.degraded]:bg-amber-500",
      )}
    />
    <span
      className={cn(
        "relative inline-flex h-2 w-2 rounded-full",
        "group-[.online]:bg-emerald-500",
        "group-[.offline]:bg-red-500",
        "group-[.maintenance]:bg-blue-500",
        "group-[.degraded]:bg-amber-500",
      )}
    />
  </span>
)

export const StatusLabel = ({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("text-muted-foreground", className)} {...props}>
    {children ?? (
      <>
        <span className="hidden group-[.online]:block">Online</span>
        <span className="hidden group-[.offline]:block">Offline</span>
        <span className="hidden group-[.maintenance]:block">Maintenance</span>
        <span className="hidden group-[.degraded]:block">Degraded</span>
      </>
    )}
  </span>
)
