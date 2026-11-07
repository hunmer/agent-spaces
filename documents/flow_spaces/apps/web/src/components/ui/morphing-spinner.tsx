"use client"

import { cn } from "@/lib/utils"

interface MorphingSpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function MorphingSpinner({ size = "md", className }: MorphingSpinnerProps) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  }

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      <div className="absolute inset-0 animate-[smoothMorph_3s_ease-in-out_infinite] bg-primary" />

      <style jsx>{`
        @keyframes smoothMorph {
          0% { 
            transform: scale(1) rotate(0deg);
            border-radius: 50%;
          }
          20% { 
            transform: scale(0.9) rotate(72deg);
            border-radius: 35%;
          }
          40% { 
            transform: scale(1.1) rotate(144deg);
            border-radius: 15%;
          }
          60% { 
            transform: scale(0.85) rotate(216deg);
            border-radius: 8%;
          }
          80% { 
            transform: scale(1.05) rotate(288deg);
            border-radius: 25%;
          }
          100% { 
            transform: scale(1) rotate(360deg);
            border-radius: 50%;
          }
        }
      `}</style>
    </div>
  )
}
