import {
  IconPlus,
  IconFileText,
  IconMessageCirclePlus,
  IconTools,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import type { AgentConfig } from "@agent-spaces/shared";
import type { JSONContent } from "@tiptap/core";

export type MentionedAgent = Pick<
  AgentConfig,
  "id" | "name" | "role" | "description" | "enabled" | "mcps" | "skills" | "tools" | "avatarUrl" | "icon" | "apiBase" | "modelId" | "providerId" | "modelProvider" | "runtimeKind" | "systemPrompt" | "backgroundUrl" | "boundWorkflowIds" | "boundWorkflowPluginTools" | "suggestions"
>;

export function collectMentionIds(node: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (current: JSONContent) => {
    if (!current) return;
    if (current.type === "mention" && typeof current.attrs?.id === "string") {
      ids.add(current.attrs.id);
    }
    if (Array.isArray(current.content)) {
      for (const child of current.content) walk(child);
    }
  };
  walk(node);
  return [...ids];
}

export function stripSimpleParagraphs(html: string): string {
  if (!html) return html;
  const stripped = html.replace(/<\/?p>/g, "");
  if (/<[^>]+>/.test(stripped)) return html;
  return html.replace(/<\/p>\s*<p>/g, "\n").replace(/<\/?p>/g, "");
}

export function getMcpLabels(mcps: AgentConfig["mcps"] | undefined): string[] {
  if (!mcps) return [];
  const servers = (mcps as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];
  return Object.keys(servers);
}

export function getToolIcon(name: string): Icon {
  if (name === "CreateCurrentChannelIssue") return IconPlus;
  if (name === "ViewCurrentChannelIssue") return IconFileText;
  if (name === "AddCurrentChannelComment") return IconMessageCirclePlus;
  if (name.includes("WorkspaceFile") || name.includes("WorkspacePath")) return IconFileText;
  return IconTools;
}

export function buildContentWithMentions(
  text: string,
  agents: Pick<AgentConfig, "id" | "name" | "role">[]
): JSONContent {
  if (!text) return { type: "doc", content: [{ type: "paragraph" }] };

  const lines = text.split("\n");
  const paragraphs: JSONContent[] = lines.map((line) => {
    const inline = parseInlineMentions(line, agents);
    return { type: "paragraph", content: inline.length > 0 ? inline : undefined };
  });

  return { type: "doc", content: paragraphs };
}

function parseInlineMentions(
  text: string,
  agents: Pick<AgentConfig, "id" | "name" | "role">[]
): JSONContent[] {
  const result: JSONContent[] = [];
  const regex = /@(\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    const name = match[1];
    const agent = agents.find(
      (a) => a.name === name || a.id === name || a.role === name
    );
    if (agent) {
      result.push({
        type: "mention",
        attrs: { id: agent.id, label: agent.name || agent.role },
      });
    } else {
      result.push({ type: "text", text: match[0] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push({ type: "text", text: text.slice(lastIndex) });
  }

  return result;
}
