"use client"

import React from "react"
import { Mic } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"

interface VoiceInputProps {
  isRecording?: boolean
  direction?: "left" | "right"
  onStart?: () => void
  onStop?: () => void
}

export function VoiceInput({
  className,
  isRecording: isRecordingExternal,
  direction = "right",
  onStart,
  onStop,
}: React.ComponentProps<"div"> & VoiceInputProps) {
  const isControlled = isRecordingExternal !== undefined
  const [_listening, _setListening] = React.useState(false)
  const listening = isControlled ? isRecordingExternal : _listening
  const [_time, _setTime] = React.useState(0)
  const isLeft = direction === "left"

  React.useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>

    if (listening) {
      if (!isControlled) onStart?.()
      intervalId = setInterval(() => {
        _setTime((t) => t + 1)
      }, 1000)
    } else {
      if (!isControlled) onStop?.()
      _setTime(0)
    }

    return () => clearInterval(intervalId)
  }, [listening])

  const onClickHandler = () => {
    if (isControlled) {
      if (listening) onStop?.()
      else onStart?.()
    } else {
      _setListening((v) => !v)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className={cn("flex items-center", className, isLeft && "justify-end")} style={isLeft ? { direction: "rtl" } : undefined}>
      <motion.div
        className="flex p-1 items-center justify-center rounded-full cursor-pointer"
        layout
        transition={{ layout: { duration: 0.4 } }}
        onClick={onClickHandler}
        style={isLeft ? { direction: "ltr" } : undefined}
      >
        <div className="h-5 w-5 items-center justify-center flex shrink-0">
          {listening ? (
            <motion.div
              className="w-3 h-3 bg-red-500 rounded-sm"
              animate={{ rotate: [0, 180, 360] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : (
            <Mic className="size-3.5" />
          )}
        </div>
        <AnimatePresence mode="wait">
          {listening && (
            <motion.div
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: "auto", marginLeft: 6 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden flex gap-1.5 items-center justify-center"
            >
              <div className="flex gap-px items-center justify-center">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-0.5 bg-red-500 rounded-full"
                    initial={{ height: 2 }}
                    animate={{
                      height: listening
                        ? [2, 3 + Math.random() * 8, 3 + Math.random() * 4, 2]
                        : 2,
                    }}
                    transition={{
                      duration: listening ? 1 : 0.3,
                      repeat: listening ? Infinity : 0,
                      delay: listening ? i * 0.05 : 0,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground w-8 text-center">
                {formatTime(_time)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
