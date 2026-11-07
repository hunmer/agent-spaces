/** A parsed item awaiting confirmation in the import preview panel. */
export interface ImportItem {
  id: string;
  name: string;
  group: string;
  content: string;
  selected: boolean;
  sourceName: string;
  files?: Array<{ path: string; content: string }>;
}
