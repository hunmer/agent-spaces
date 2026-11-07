import type { SearchCommandProvider } from './types';
import { channelSearch } from './channel-search';
import { issueSearch } from './issue-search';
import { fileSearch } from './file-search';
import { workspaceSearch } from './workspace-search';
import { serverSearch } from './server-search';

export type { SearchResult, SearchCommandProvider } from './types';

export const searchProviders: SearchCommandProvider[] = [
  channelSearch,
  issueSearch,
  fileSearch,
  workspaceSearch,
  serverSearch,
];

export function matchProvider(input: string): { provider: SearchCommandProvider; keyword: string } | null {
  for (const provider of searchProviders) {
    const prefixes = [provider.prefix, ...provider.aliases];
    for (const p of prefixes) {
      if (input === p + ' ' || input.startsWith(p + ' ')) {
        return { provider, keyword: input.slice(p.length + 1) };
      }
    }
  }
  return null;
}
