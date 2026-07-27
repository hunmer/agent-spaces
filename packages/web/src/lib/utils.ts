import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import Pinyin from "tiny-pinyin"

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

/**
 * 生成用于中文拼音搜索的匹配键。
 *
 * 将文本拆解为 token，把「小写原文」「中文全拼」「首字母」三类信息拼接在一起，
 * 例如 "AI对话" → "ai对话 aiduihua aidh"。调用方用
 * `toPinyinSearchKey(text).includes(query.toLowerCase())` 即可同时支持按原文、
 * 全拼（duihua）和首字母（dh）搜索中文标签。
 *
 * 当运行环境不支持 Intl（`Pinyin.isSupported()` 为 false）时，回退为纯原文小写。
 */
export function toPinyinSearchKey(text: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  if (!Pinyin.isSupported()) return lower;

  const tokens = Pinyin.parse(text);
  let full = '';
  let initials = '';
  for (const token of tokens) {
    // type: 1-拉丁/数字, 2-中文(已转拼音), 3-标点等其它
    if (token.type === 2) {
      const pinyin = token.target.toLowerCase();
      full += pinyin;
      initials += pinyin.charAt(0);
    } else {
      full += token.source.toLowerCase();
      if (token.type === 1) initials += token.source.charAt(0).toLowerCase();
    }
  }
  return `${lower} ${full} ${initials}`;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Some browsers expose Clipboard API but reject writes outside secure contexts.
    }
  }

  fallbackCopyToClipboard(text)
}

function fallbackCopyToClipboard(text: string): void {
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('Clipboard API is not available')
  }

  const textarea = document.createElement('textarea')
  const selection = document.getSelection()
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  textarea.value = text
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.opacity = '0'

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Clipboard copy failed')
    }
  } finally {
    document.body.removeChild(textarea)
    if (selection && selectedRange) {
      selection.removeAllRanges()
      selection.addRange(selectedRange)
    }
  }
}

/**
 * 二进制/资源文件扩展名集合：这些文件不会被源码 import 解析，
 * utf-8 当文本读取无意义，且会触发大体积 fetch（如 wasm 38MB、pck 12MB、glb）。
 * mini-app 的 vendor 运行时资源（pixelorama/director-desk iframe、fabric/painterro fetch+eval）
 * 都是按需懒加载，初始化时无需预读。
 */
const SKIP_READ_EXTENSIONS = new Set([
  '.wasm', '.pck', '.glb', '.gltf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp',
  '.ico', '.svg', '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.woff', '.woff2', '.ttf', '.eot',
  '.otf', '.zip', '.gz', '.tar', '.pdf',
])

/** 判断文件是否为无需预读的二进制/资源文件（按扩展名）。 */
export function isSkippableAsset(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.')
  if (dot < 0) return false
  return SKIP_READ_EXTENSIONS.has(filePath.slice(dot).toLowerCase())
}
