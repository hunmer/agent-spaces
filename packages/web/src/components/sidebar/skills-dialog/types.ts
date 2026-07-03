export interface BoundAgent {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  filename: string;
  content: string;
  favorited: boolean;
  group: string;
  boundAgents: BoundAgent[];
}

export interface AgentCandidate {
  id: string;
  name: string;
  avatarUrl?: string;
  apiBase?: string;
  description?: string;
}

export interface SkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
  selectable?: boolean;
  selectedSkills?: string[];
  onSelectedSkillsChange?: (skills: string[]) => void;
}

export type FilterMode = 'all' | 'favorites' | 'agent';

export interface SkillSyncItem {
  agentId: string;
  agentName: string;
  skillName: string;
  globalMtime: string;
  agentMtime: string;
}

export interface StoreSkillItem {
  id: string;
  name: string;
  group: string;
  path: string;
}
