import type { NodeTypeDefinition } from '@agent-spaces/shared';
import { LOCAL_BRIDGE_WORKFLOW_NODES } from '@agent-spaces/shared';
import { flowControlNodes, aiNodes, interactionNodes, displayNodes, utilsNodes, stringNodes, sqliteNodes, knowledgeBaseNodes, miniappNodes } from './definitions';

// ---- All node definitions (raw, with i18n keys) ----

export const allNodeDefinitions: NodeTypeDefinition[] = [
  ...flowControlNodes,
  ...aiNodes,
  ...interactionNodes,
  ...displayNodes,
  ...utilsNodes,
  ...stringNodes,
  ...sqliteNodes,
  ...knowledgeBaseNodes,
  ...miniappNodes,
  ...LOCAL_BRIDGE_WORKFLOW_NODES,
];

// ---- Plugin registry ----

let _pluginNodeDefinitions: NodeTypeDefinition[] = [];
let _pluginNodesVersion = 0;
const _pluginNodesListeners = new Set<() => void>();

export function getPluginNodesVersion() { return _pluginNodesVersion; }

export function getAllNodeDefinitions(): NodeTypeDefinition[] {
  return [...allNodeDefinitions, ..._pluginNodeDefinitions];
}

export function subscribePluginNodesVersion(listener: () => void): () => void {
  _pluginNodesListeners.add(listener);
  return () => _pluginNodesListeners.delete(listener);
}

function notifyPluginNodesChanged(): void {
  for (const listener of _pluginNodesListeners) listener();
}

export function registerPluginNodeDefinitions(nodes: NodeTypeDefinition[]): void {
  _pluginNodeDefinitions = nodes;
  _pluginNodesVersion++;
  notifyPluginNodesChanged();
}

export function clearPluginNodeDefinitions(): void {
  _pluginNodeDefinitions = [];
  _pluginNodesVersion++;
  notifyPluginNodesChanged();
}

// ---- Query helpers (raw, with i18n keys) ----

export function getNodeDefinitionsByCategory(): Record<string, NodeTypeDefinition[]> {
  const groups: Record<string, NodeTypeDefinition[]> = {};
  for (const def of getAllNodeDefinitions()) {
    if (!groups[def.category]) groups[def.category] = [];
    groups[def.category].push(def);
  }
  return groups;
}

export function getNodeDefinition(type: string): NodeTypeDefinition | undefined {
  return allNodeDefinitions.find(d => d.type === type) || _pluginNodeDefinitions.find(d => d.type === type);
}

export function searchNodeDefinitions(query: string): NodeTypeDefinition[] {
  const q = query.toLowerCase();
  return getAllNodeDefinitions().filter(
    d => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q),
  );
}
