import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const PALETTE = [
  'bg-red-500/15 text-red-600 dark:text-red-400',
  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  'bg-lime-500/15 text-lime-600 dark:text-lime-400',
  'bg-green-500/15 text-green-600 dark:text-green-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
  'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
]

const FILL_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e',
]

function textHash(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

export function textColorClass(text: string): string {
  return PALETTE[textHash(text) % PALETTE.length]
}

export function textToColor(text: string): string {
  return FILL_COLORS[textHash(text) % FILL_COLORS.length]
}
