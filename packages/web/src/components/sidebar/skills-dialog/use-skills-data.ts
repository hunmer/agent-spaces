'use client';

import { useCallback, useEffect, useState } from 'react';
import { sdk } from '@/lib/sdk';
import { fetchStoreIndex } from '@/lib/agent-store';
import { isBuiltinAgent } from '@agent-spaces/shared';
import type { AgentCandidate, SkillInfo, SkillSyncItem, StoreSkillItem } from './types';
import type { ImportItem } from '../import-panel/types';

export function useSkillsData(open: boolean, standalone?: boolean) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [agents, setAgents] = useState<AgentCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  // Store state
  const [storeSkills, setStoreSkills] = useState<StoreSkillItem[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [importingPaths, setImportingPaths] = useState<Set<string>>(new Set());

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      setSkills((await sdk.skills.list()) as unknown as SkillInfo[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await sdk.agent.listPresets();
      setAgents(data.filter((a: AgentCandidate) => !isBuiltinAgent(a.id)).map((a: AgentCandidate) => ({
        id: a.id,
        name: a.name,
        avatarUrl: a.avatarUrl,
        apiBase: a.apiBase,
        description: a.description,
      })));
    } catch { /* ignore */ }
  }, []);

  const fetchStoreSkills = useCallback(async () => {
    setStoreLoading(true);
    try {
      const data = await fetchStoreIndex<StoreSkillItem>('skills/index.json');
      setStoreSkills(data);
    } catch { /* ignore */ }
    setStoreLoading(false);
  }, []);

  useEffect(() => {
    if (open || standalone) {
      fetchSkills();
      fetchAgents();
      fetchStoreSkills();
    }
  }, [open, standalone, fetchSkills, fetchAgents, fetchStoreSkills]);

  // Local skill names for dedup
  const localSkillNames = new Set(skills.map((s) => s.name));

  const importFromStore = async (storeSkill: StoreSkillItem) => {
    if (localSkillNames.has(storeSkill.id) || importingPaths.has(storeSkill.path)) return false;
    setImportingPaths((prev) => new Set(prev).add(storeSkill.path));
    try {
      await sdk.skills.importStore(storeSkill.path, storeSkill.group);
      await fetchSkills();
      return true;
    } catch { /* ignore */ }
    setImportingPaths((prev) => {
      const next = new Set(prev);
      next.delete(storeSkill.path);
      return next;
    });
    return false;
  };

  return { skills, setSkills, agents, loading, fetchSkills, storeSkills, storeLoading, importingPaths, importFromStore };
}

export function useSkillActions(skills: SkillInfo[], setSkills: (fn: (prev: SkillInfo[]) => SkillInfo[]) => void, fetchSkills: () => Promise<void>) {
  const toggleFavorite = async (skill: SkillInfo) => {
    try {
      const { favorited } = await sdk.skills.toggleFavorite(skill.name);
      setSkills((prev) =>
        prev.map((s) => s.name === skill.name ? { ...s, favorited } : s),
      );
    } catch { /* ignore */ }
  };

  const deleteSkill = async (skill: SkillInfo) => {
    try {
      await sdk.skills.delete_(skill.name);
      setSkills((prev) => prev.filter((s) => s.name !== skill.name));
    } catch { /* ignore */ }
  };

  const saveEdit = async (name: string, content: string) => {
    try {
      await sdk.skills.save(name, content);
      setSkills((prev) =>
        prev.map((s) => s.name === name ? { ...s, content } : s),
      );
      return true;
    } catch { /* ignore */ }
    return false;
  };

  const importBatch = async (items: ImportItem[]) => {
    const batchItems = items.map((item) => ({
      name: item.name,
      content: item.content,
      group: item.group,
    }));
    try {
      await sdk.skills.importBatch(batchItems);
      fetchSkills();
    } catch { /* ignore */ }
  };

  const importFromGit = async (url: string): Promise<{ name: string; content: string }[] | null> => {
    try {
      return (await sdk.skills.importGit(url)) as Array<{ name: string; content: string }>;
    } catch { /* ignore */ }
    return null;
  };

  const bindConfirm = async (skill: SkillInfo, bindSelected: string[], agents: { id: string }[]) => {
    for (const agent of agents) {
      const shouldBeBound = bindSelected.includes(agent.id);
      const preset = await sdk.agent.getPreset(agent.id) as Record<string, any>;
      if (!preset) continue;
      const skillsWithout = (preset.skills || []).filter(
        (s: string) => s.replace(/\.md$/i, '') !== skill.name,
      );
      const updatedSkills = shouldBeBound ? [...skillsWithout, skill.name] : skillsWithout;
      await sdk.agent.updatePreset(agent.id, { ...preset, skills: updatedSkills });
    }
    fetchSkills();
  };

  const syncCheck = async (): Promise<SkillSyncItem[]> => {
    try {
      return (await sdk.skills.syncCheck()) as unknown as SkillSyncItem[];
    } catch { /* ignore */ }
    return [];
  };

  const syncConfirm = async (items: SkillSyncItem[]) => {
    try {
      await sdk.skills.sync(items.map((i) => ({ agentId: i.agentId, skillName: i.skillName })));
      fetchSkills();
      return true;
    } catch { /* ignore */ }
    return false;
  };

  const applyAllToAgent = async (agentId: string, skillNames: string[]) => {
    try {
      const preset = await sdk.agent.getPreset(agentId) as Record<string, any>;
      if (!preset) return;
      const existing = new Set((preset.skills || []).map((s: string) => s.replace(/\.md$/i, '')));
      const updatedSkills = [...(preset.skills || [])];
      for (const name of skillNames) {
        if (!existing.has(name)) {
          updatedSkills.push(name);
        }
      }
      await sdk.agent.updatePreset(agentId, { ...preset, skills: updatedSkills });
      fetchSkills();
    } catch { /* ignore */ }
  };

  return { toggleFavorite, deleteSkill, saveEdit, importBatch, importFromGit, bindConfirm, applyAllToAgent, syncCheck, syncConfirm };
}
