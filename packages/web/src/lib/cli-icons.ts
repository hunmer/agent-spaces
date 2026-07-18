/**
 * CLI 图标工具。
 *
 * 图标源文件位于 `packages/server/public/cli-icons/`，
 * 服务端通过 `/public/cli-icons/*` 静态 serve，
 * next.config 已将 `/public/:path*` 代理到服务端。
 *
 * 不同 CLI id 对应不同文件名，缺省时返回 null（调用方用兜底图标）。
 */
import type { RuntimeCliId } from "@/lib/runtime-cli-settings";

const ICON_BY_ID: Partial<Record<RuntimeCliId, string>> = {
  "claude-code": "claude-color.svg",
  "claude-code-sdk": "claude-color.svg",
  "codex": "openai.svg",
  "codex-sdk": "openai.svg",
  "grok": "grok.svg",
  "gemini-cli": "geminicli-color.svg",
  "hermes": "hermesagent.svg",
};

const ICON_BASE = "/public/cli-icons";

/** 返回指定 CLI id 的图标 URL；未配置则返回 null */
export function getCliIconUrl(id: string): string | null {
  const file = ICON_BY_ID[id as RuntimeCliId];
  return file ? `${ICON_BASE}/${file}` : null;
}
