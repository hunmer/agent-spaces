import type { HttpClient } from '../client';
import type { AgentConfig } from '@agent-spaces/shared';

export interface InstalledSkillsPackage {
  agent: AgentConfig;
  skills: string[];
  created: boolean;
}

export function createSkillsPackageApi(http: HttpClient) {
  return {
    /** 从商店 zipUrl 安装技能包（创建/更新 agent 模板 + 解压私有 skill） */
    install: (zipUrl: string): Promise<InstalledSkillsPackage> =>
      http.post('/api/skills-packages/install', { zipUrl }),

    /** 直接传 zip base64 内容安装 */
    installFromBase64: (zipBase64: string): Promise<InstalledSkillsPackage> =>
      http.post('/api/skills-packages/install', { zipBase64 }),
  };
}
