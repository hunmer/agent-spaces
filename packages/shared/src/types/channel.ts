export interface TodoItem {
  id: string;
  subject: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  type: 'general' | 'issue' | 'agent';
  issueId?: string;
  members: string[];
  pinnedMentionId?: string;
  draft?: {
    content: string;
    updatedAt: string;
  };
  todos?: TodoItem[];
  notifyOnComplete?: boolean;
  archived?: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderRole?: string;
  content: string;
  type: 'text' | 'mention' | 'attachment' | 'code_ref' | 'file_ref';
  status?: 'pending' | 'streaming' | 'waiting_for_user' | 'completed' | 'error';
  attachments?: Attachment[];
  parts?: MessagePart[];
  metadata?: MessageMetadata;
  replies?: MessageReply[];
  codeRef?: { file: string; range: [number, number] };
  createdAt: string;
}

export interface MessageReply {
  id: string;
  senderId: string;
  senderRole?: string;
  content: string;
  status?: Message['status'];
  attachments?: Attachment[];
  parts?: MessagePart[];
  metadata?: MessageMetadata;
  createdAt: string;
}

export interface Attachment {
  name: string;
  path: string;
  type: string;
  size?: number;
  url?: string;
}

export type MessagePart =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'user_message'; text: string; senderName?: string }
  | { id: string; type: 'reasoning'; text: string; duration?: number; status?: 'streaming' | 'completed' }
  | { id: string; type: 'chain'; chains: MessageChain[] }
  | { id: string; type: 'terminal'; command?: string; output: string; status?: 'streaming' | 'completed' | 'error' }
  | { id: string; type: 'confirmation'; title: string; description?: string; approval?: MessageApproval }
  | { id: string; type: 'context'; usedTokens: number; maxTokens: number; modelId?: string; usage?: MessageTokenUsage }
  | { id: string; type: 'subagent'; name: string; model?: string; instructions?: string; output?: string; tools?: MessageTool[] }
  | { id: string; type: 'ask_user_question'; question: string; choices?: string[]; status?: 'requested' | 'answered'; answer?: string; toolUseId?: string };

export interface MessageChain {
  id: string;
  title: string;
  description?: string;
  status?: 'pending' | 'completed';
  kind?: 'tool' | 'message';
  text?: string;
  toolName?: string;
  filePath?: string;
  command?: string;
  detailId?: string;
}

export interface MessageApproval {
  id: string;
  approved?: boolean;
  reason?: string;
}

export interface MessageTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface MessageTool {
  name?: string;
  description?: string;
  inputSchema?: object;
  jsonSchema?: object;
}

export interface MessageMetadata {
  agentSessionId?: string;
  runtime?: string;
  model?: string;
  summary?: string;
  duration?: number;
  taskId?: string;
  phase?: string;
}
