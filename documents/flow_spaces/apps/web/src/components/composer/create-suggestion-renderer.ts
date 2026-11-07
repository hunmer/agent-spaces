import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance } from 'tippy.js';
import { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { PluginKey } from '@tiptap/pm/state';

import { SuggestionList } from './suggestion-list';

type SuggestionRendererProps = SuggestionProps<Record<string, unknown>>;

function createListProps(props: SuggestionRendererProps, pluginKey?: PluginKey): SuggestionRendererProps {
  return {
    ...props,
    command: (item) => {
      props.command(item);
      exitSuggestion(props.editor.view, pluginKey);
    },
  };
}

export function createSuggestionRenderer(pluginKey?: PluginKey) {
  let component: ReactRenderer | null = null;
  let popup: Instance[] | null = null;

  return {
    onStart(props: SuggestionRendererProps) {
      component = new ReactRenderer(SuggestionList, {
        props: createListProps(props, pluginKey),
        editor: props.editor,
      });
      if (!props.clientRect) return;
      const getReferenceClientRect = () => props.clientRect?.() ?? new DOMRect();
      popup = tippy('body', {
        getReferenceClientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      });
    },
    onUpdate(props: SuggestionRendererProps) {
      component?.updateProps(createListProps(props, pluginKey));
      if (popup?.[0] && props.clientRect) {
        popup[0].setProps({ getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect() });
      }
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (component?.ref && typeof component.ref === 'object' && 'onKeyDown' in component.ref) {
        return (component.ref as { onKeyDown: (props: { event: KeyboardEvent }) => boolean }).onKeyDown(props);
      }
      return false;
    },
    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
      popup = null;
      component = null;
    },
  };
}
