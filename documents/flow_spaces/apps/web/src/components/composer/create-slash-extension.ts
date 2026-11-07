import { Extension, type Editor } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';

import { createSuggestionRenderer } from './create-suggestion-renderer';

type EditorRange = { from: number; to: number };
type GetSkills = () => string[];
type SlashCommand = {
  id: string;
  name: string;
  content?: string;
  insertText?: string;
};
type GetCommands = () => SlashCommand[];
type SlashItem = {
  id: string;
  title: string;
  description: 'skill' | 'command';
  insertText?: string;
};

function getSlashItems(skills: string[], commands: SlashCommand[], query: string): SlashItem[] {
  const keyword = query.toLowerCase();
  const seenSkills = new Set<string>();
  const seenCommands = new Set<string>();

  const skillItems = skills
    .map((skill) => skill.trim())
    .filter((skill) => {
      if (!skill || seenSkills.has(skill)) return false;
      seenSkills.add(skill);
      return skill.toLowerCase().includes(keyword);
    })
    .map((skill) => ({
      id: skill,
      title: skill,
      description: 'skill' as const,
    }));

  const commandItems = commands
    .filter((command) => {
      const name = command.name.trim();
      if (!command.id || !name || seenCommands.has(command.id)) return false;
      seenCommands.add(command.id);
      return `${name} ${command.content ?? ''}`.toLowerCase().includes(keyword);
    })
    .map((command) => ({
      id: command.id,
      title: command.name,
      description: 'command' as const,
      insertText: command.insertText,
    }));

  return [...skillItems, ...commandItems];
}

export function createSlashExtension(getSkills: GetSkills = () => [], getCommands: GetCommands = () => []) {
  return Extension.create({
    name: 'slashCommand',
    addOptions() {
      return {
        suggestion: {
          char: '/',
          items: ({ query }: { query: string }) => {
            return getSlashItems(getSkills(), getCommands(), query);
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: EditorRange;
            props: SlashItem;
          }) => {
            const content = props.description === 'command'
              ? `/${props.insertText ?? props.id}`
              : `[use skill: ${props.id}]`;
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(content)
              .run();
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
