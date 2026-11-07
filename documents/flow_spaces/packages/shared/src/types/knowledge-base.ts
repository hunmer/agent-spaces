export type KbFileSourceType = 'upload' | 'path' | 'url';
export type KbFileIndexStatus = 'pending' | 'indexing' | 'indexed' | 'failed';

export interface KnowledgeBase {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  embeddingModelId: string | null;
  chunkSize: number;
  chunkOverlap: number;
  createdAt: number;
  updatedAt: number;
}

export interface KbFile {
  id: string;
  kbId: string;
  fileName: string;
  mimeType: string;
  size: number;
  sourceType: KbFileSourceType;
  sourceRef: string;
  storagePath: string;
  extractedText: string;
  chunkCount: number;
  indexStatus: KbFileIndexStatus;
  indexError: string | null;
  indexedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface KbChunk {
  chunkId: string;
  kbId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
  contentHash: string;
  modelId: string;
  createdAt: number;
}

export interface KnowledgeBaseStats {
  kbId: string;
  fileCount: number;
  indexedCount: number;
  pendingCount: number;
  failedCount: number;
  chunkCount: number;
}

export interface KbQueryMatch {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  chunkText: string;
  score: number;
}

export interface KbQueryResult {
  matches: KbQueryMatch[];
  count: number;
}

export interface KbAddFileBody {
  sourceType: 'path' | 'url';
  sourceRef: string;
  fileName?: string;
}
