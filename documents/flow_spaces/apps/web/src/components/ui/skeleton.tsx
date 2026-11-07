import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

function SkeletonGroup({ count = 3, children }: { count?: number; children: (i: number) => React.ReactNode }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>{children(i)}</div>
      ))}
    </>
  )
}

export { Skeleton, SkeletonGroup }
