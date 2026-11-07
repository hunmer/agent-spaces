import { BUILT_IN_AGENT_TOOLS } from '@agent-spaces/shared';
import { listMcps } from './mcp.js';
import { listSkills } from './skill.js';

export function listAvailableAgentCapabilities() {
  const mcps = listMcps().map((item) => ({
    name: item.name,
    description: item.description,
  }));
  const skills = listSkills().map((item) => ({
    name: item.name,
    description: item.description,
  }));
  const tools = BUILT_IN_AGENT_TOOLS.map((item) => ({
    name: item.name,
    label: item.label,
    description: item.description,
  }));

  return {
    mcps,
    skills,
    tools,
  };
}
