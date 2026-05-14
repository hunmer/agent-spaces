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
  const trimmed = input.trim();
  if (!trimmed.includes(' ')) return null;

  const spaceIdx = trimmed.indexOf(' ');
  const prefix = trimmed.slice(0, spaceIdx).toLowerCase();
  const keyword = trimmed.slice(spaceIdx + 1);

  for (const provider of searchProviders) {
    if (provider.prefix === prefix || provider.aliases.includes(prefix)) {
      return { provider, keyword };
    }
  }
  return null;
}
