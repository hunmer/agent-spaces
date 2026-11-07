import * as React from "react"
import { cn } from "@/lib/utils"

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />
}

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium", className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function FieldSeparator({ children, className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("relative flex items-center py-2", className)} {...props}>
      <div className="flex-1 border-t" />
      {children && (
        <span className="px-2 text-xs text-muted-foreground">{children}</span>
      )}
      <div className="flex-1 border-t" />
    </div>
  )
}

export { Field, FieldGroup, FieldLabel, FieldDescription, FieldSeparator }
