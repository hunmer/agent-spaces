export interface CodeFavorite {
  id: string;
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  label?: string;
  snippet?: string;
  createdAt: number;
  workspaceId: string;
}
