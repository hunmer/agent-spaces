import { Extension, type Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';

import { createSuggestionRenderer } from './create-suggestion-renderer';

type EditorRange = { from: number; to: number };

type AgentToolItem = {
  name: string;
  label: string;
};

type AgentResourceSource = {
  mcps: string[];
  tools: AgentToolItem[];
};

type AgentResourceItem = {
  id: string;
  title: string;
  description: string;
  kind: 'mcp' | 'tool';
  value: string;
};

type GetAgentResources = () => AgentResourceSource;

const agentResourcePluginKey = new PluginKey('agentResourceSuggestion');

function getResourceItems({ mcps, tools }: AgentResourceSource, query: string): AgentResourceItem[] {
  const keyword = query.toLowerCase();
  const seen = new Set<string>();
  const items: AgentResourceItem[] = [];

  for (const mcp of mcps) {
    const name = mcp.trim();
    const key = `mcp:${name}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    if (!name.toLowerCase().includes(keyword)) continue;
    items.push({
      id: key,
      title: name,
      description: 'mcp',
      kind: 'mcp',
      value: name,
    });
  }

  for (const tool of tools) {
    const name = tool.name.trim();
    const label = tool.label.trim() || name;
    const key = `tool:${name}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    if (!`${name} ${label}`.toLowerCase().includes(keyword)) continue;
    items.push({
      id: key,
      title: label,
      description: `tool · ${name}`,
      kind: 'tool',
      value: name,
    });
  }

  return items;
}

export function createAgentResourceExtension(getResources: GetAgentResources = () => ({ mcps: [], tools: [] })) {
  return Extension.create({
    name: 'agentResource',

    addOptions() {
      return {
        suggestion: {
          char: '$',
          items: ({ query }: { query: string }) => {
            return getResourceItems(getResources(), query);
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: EditorRange;
            props: AgentResourceItem;
          }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(`[use ${props.kind}: ${props.value}]`)
              .run();
          },
          render: () => createSuggestionRenderer(agentResourcePluginKey),
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: agentResourcePluginKey,
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}
