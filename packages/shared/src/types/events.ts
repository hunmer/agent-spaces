export interface WSEvent<T = unknown> {
  event: string;
  workspaceId: string;
  timestamp: string;
  data: T;
}
