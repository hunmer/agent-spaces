'use client';

import { useEffect, useState } from 'react';
import type { AgentConfig } from '@agent-spaces/shared';
import { Bot, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AgentIcon } from '@/components/common/agent-icon';
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { newAgentDraft, normalizeAgent, type AgentPreset } from '@/components/sidebar/agent-shared';
import { useAgentStore } from '@/stores/agent';

function resolveAgentValue(value: unknown, agents: AgentConfig[]): AgentConfig | AgentPreset | null {
  if (typeof value === 'string' && value.trim()) {
    return agents.find((agent) => agent.id === value.trim()) ?? null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<AgentConfig>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  return record as AgentConfig;
}

function toWorkflowAgentValue(agent: AgentConfig | AgentPreset) {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    description: agent.description,
    runtimeKind: agent.runtimeKind,
    modelProvider: agent.modelProvider,
    providerId: agent.providerId,
    modelId: agent.modelId,
    apiBase: agent.apiBase,
    apiKey: agent.apiKey,
    workingDir: agent.workingDir,
    mcps: agent.mcps,
    skills: agent.skills,
    tools: agent.tools,
    systemPrompt: agent.systemPrompt,
    outputStyle: agent.outputStyle,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    sandboxDirs: agent.sandboxDirs,
    avatarUrl: agent.avatarUrl,
    icon: agent.icon,
    enabled: agent.enabled,
  };
}

export function AgentPropertyEditor({
  value,
  disabled,
  onChange,
}: {
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<AgentPreset | null>(null);

  useEffect(() => {
    void ensureAgents();
  }, [ensureAgents]);

  const selectedAgent = resolveAgentValue(value, agents);
  const enabledAgents = agents.filter((agent) => agent.enabled !== false);

  const handleSubmitAgent = (ids: string[]) => {
    const agentId = ids[0];
    if (agentId) {
      const agent = agents.find((item) => item.id === agentId);
      onChange(agent ? toWorkflowAgentValue(agent) : null);
    } else {
      onChange(null);
    }
    setPickerOpen(false);
  };

  const handleEditAgent = () => {
    setCreateDraft(selectedAgent ? normalizeAgent(selectedAgent as AgentConfig) : newAgentDraft('agent'));
    setEditorOpen(true);
  };

  const handleSavedAgent = (saved: AgentPreset) => {
    onChange(toWorkflowAgentValue(saved));
    setEditorOpen(false);
    setCreateDraft(null);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-2 text-left text-xs shadow-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {selectedAgent ? (
            <>
              <AgentIcon
                agentId={selectedAgent.id}
                name={selectedAgent.name}
                avatarUrl={selectedAgent.avatarUrl}
                className="size-4 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1 truncate">{selectedAgent.name}</span>
            </>
          ) : (
            <>
              <Bot className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">选择 Agent</span>
            </>
          )}
        </button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={disabled}
          title={selectedAgent ? '修改 Agent' : '新建 Agent'}
          onClick={handleEditAgent}
        >
          {selectedAgent ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        </Button>
      </div>

      <AgentPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSubmit={handleSubmitAgent}
        title="选择 Agent"
        description="选择一个 Agent 保存到当前节点"
        agents={enabledAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          avatarUrl: agent.avatarUrl,
          icon: agent.icon,
          description: agent.description,
        }))}
        initialSelected={selectedAgent ? [selectedAgent.id] : []}
        confirmText="选择"
        singleSelect
      />

      <Dialog
        open={editorOpen && Boolean(createDraft)}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setCreateDraft(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle>{selectedAgent ? '修改 Agent' : '新建 Agent'}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          {createDraft && (
            <AgentEditor
              agent={createDraft}
              onSaved={handleSavedAgent}
              onBack={() => {
                setEditorOpen(false);
                setCreateDraft(null);
              }}
              commit={async (draft) => toWorkflowAgentValue(draft) as AgentPreset}
              showFooter
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
