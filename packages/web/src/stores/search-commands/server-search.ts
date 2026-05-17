import { Server, Globe } from 'lucide-react';
import type { SearchCommandProvider } from './types';
import { loadServers, loadActiveId, saveActiveId, setActiveServerCookie } from '@/lib/server';
import { useEditorStore } from '../editor';

export const serverSearch: SearchCommandProvider = {
  prefix: 'server',
  aliases: ['s', 'sv'],
  label: 'Server',
  icon: Server,
  search: (keyword) => {
    const servers = loadServers();
    const activeId = loadActiveId();
    const lower = keyword.toLowerCase();
    return servers
      .filter((sv) =>
        sv.name.toLowerCase().includes(lower) ||
        sv.url.toLowerCase().includes(lower),
      )
      .map((sv) => ({
        id: sv.id,
        label: sv.name + (sv.id === activeId ? ' (active)' : ''),
        description: sv.url,
        icon: Globe,
        action: () => {
          useEditorStore.getState().resetEditorState();
          saveActiveId(sv.id);
          setActiveServerCookie(sv.url);
          window.location.reload();
        },
      }));
  },
};
