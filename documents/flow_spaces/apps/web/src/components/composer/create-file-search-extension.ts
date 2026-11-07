import { Extension, type Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';

import { createSuggestionRenderer } from './create-suggestion-renderer';
import { sdk } from '@/lib/sdk';

type EditorRange = { from: number; to: number };

type FileSearchItem = {
  id: string;
  title: string;
  description: string;
};

const fileSearchPluginKey = new PluginKey('fileSearchSuggestion');

export function createFileSearchExtension(workspaceId: string) {
  return Extension.create({
    name: 'fileSearch',

    addOptions() {
      return {
        suggestion: {
          char: '#',
          items: async ({ query }: { query: string }): Promise<FileSearchItem[]> => {
            if (!query.trim()) return [];

            try {
              const results = await sdk.search.files(workspaceId, query.trim());
              return (results || [])
                .filter((r: { type: string }) => r.type === 'file')
                .slice(0, 10)
                .map((r: { path: string; name: string }) => ({
                  id: r.path,
                  title: r.name,
                  description: r.path,
                }));
            } catch {
              return [];
            }
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: EditorRange;
            props: FileSearchItem;
          }) => {
            editor.chain().focus().deleteRange(range).insertContent(props.description + ' ').run();
          },
          render: () => createSuggestionRenderer(fileSearchPluginKey),
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: fileSearchPluginKey,
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}
