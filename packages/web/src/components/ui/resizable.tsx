"use client"

import { createContext, useContext, useState } from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

const ResizableHandleVisibilityContext = createContext(false)

function ResizablePanelGroup({
  className,
  hideHandleOnIdle = false,
  ...props
}: ResizablePrimitive.GroupProps & {
  /** 隐藏调节栏，仅在鼠标悬停或键盘聚焦时显示。 */
  hideHandleOnIdle?: boolean
}) {
  return (
    <ResizableHandleVisibilityContext.Provider value={hideHandleOnIdle}>
      <ResizablePrimitive.Group
        data-slot="resizable-panel-group"
        className={cn(
          "flex h-full w-full aria-[orientation=vertical]:flex-col",
          className
        )}
        {...props}
      />
    </ResizableHandleVisibilityContext.Provider>
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  hideOnIdle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
  /** 覆盖组级配置，隐藏调节栏直到 hover/focus。 */
  hideOnIdle?: boolean
}) {
  const hideHandleOnIdle = useContext(ResizableHandleVisibilityContext)
  const shouldHideOnIdle = hideOnIdle ?? hideHandleOnIdle
  const [isHandleActive, setIsHandleActive] = useState(false)
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        shouldHideOnIdle && "transition-opacity duration-150",
        className
      )}
      {...props}
      style={{
        ...props.style,
        ...(shouldHideOnIdle ? { opacity: isHandleActive ? 1 : 0 } : {}),
      }}
      onMouseEnter={(event) => {
        props.onMouseEnter?.(event)
        setIsHandleActive(true)
      }}
      onMouseLeave={(event) => {
        props.onMouseLeave?.(event)
        setIsHandleActive(false)
      }}
      onFocus={(event) => {
        props.onFocus?.(event)
        setIsHandleActive(true)
      }}
      onBlur={(event) => {
        props.onBlur?.(event)
        setIsHandleActive(false)
      }}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
