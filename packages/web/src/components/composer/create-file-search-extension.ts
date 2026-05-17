import { Extension, type Editor } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';

import { createSuggestionRenderer } from './create-suggestion-renderer';

type EditorRange = { from: number; to: number };

type FileSearchItem = {
  id: string;
  title: string;
  description: string;
};

export function createFileSearchExtension(workspaceId: string) {
  let abortController: AbortController | null = null;

  return Extension.create({
    name: 'fileSearch',

    addOptions() {
      return {
        suggestion: {
          char: '#',
          items: async ({ query }: { query: string }): Promise<FileSearchItem[]> => {
            if (!query.trim()) return [];

            abortController?.abort();
            abortController = new AbortController();

            try {
              const res = await fetch(
                `/api/workspaces/${workspaceId}/search/files?q=${encodeURIComponent(query.trim())}`,
                { signal: abortController.signal }
              );
              if (!res.ok) return [];
              const data = await res.json();
              return (data.results || [])
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
          render: () => createSuggestionRenderer(),
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}
