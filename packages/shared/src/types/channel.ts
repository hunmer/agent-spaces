export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  type: 'general' | 'issue' | 'agent';
  issueId?: string;
  members: string[];
  createdAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderRole?: string;
  content: string;
  type: 'text' | 'mention' | 'attachment' | 'code_ref' | 'file_ref';
  status?: 'pending' | 'streaming' | 'completed' | 'error';
  attachments?: Attachment[];
  codeRef?: { file: string; range: [number, number] };
  createdAt: string;
}

export interface Attachment {
  name: string;
  path: string;
  type: string;
}
