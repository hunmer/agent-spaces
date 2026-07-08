"use client";

import { useRef, useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ChatAgent } from "@agent-spaces/sdk";
import { AgentEditor, type AgentEditorHandle } from "@/components/sidebar/agent-editor";
import { type AgentPreset, newEmptyAgent } from "@/components/sidebar/agent-shared";
import { useTranslations } from "next-intl";

function chatAgentToPreset(agent: ChatAgent): AgentPreset {
  return {
    ...newEmptyAgent(),
    id: agent.id ?? `draft-chat-${Date.now()}`,
    name: agent.name,
    description: agent.description ?? "",
    systemPrompt: agent.systemPrompt ?? "",
    modelProvider: (agent.modelProvider || agent.provider || "") as AgentPreset["modelProvider"],
    providerId: agent.providerId ?? "",
    modelId: agent.modelId || agent.model,
    apiKey: agent.apiKey ?? "",
    apiBase: agent.apiBase ?? agent.baseURL ?? "",
    avatarUrl: agent.avatarUrl ?? agent.avatar ?? "",
    icon: agent.icon ?? "",
    runtimeKind: "langchain",
    workingDir: agent.workingDir ?? "",
    mcps: agent.mcps ?? {},
    skills: (agent.skills ?? []).map((skill) => (
      typeof skill === "string" ? { name: skill } : { name: skill.name, content: skill.content }
    )),
    tools: agent.tools ?? newEmptyAgent().tools,
    boundWorkflowIds: agent.boundWorkflowIds ?? [],
    boundWorkflowPluginTools: agent.boundWorkflowPluginTools ?? [],
    outputStyle: agent.outputStyle ?? "",
    suggestions: agent.suggestions ?? [],
    openingMessage: agent.openingMessage ?? "",
    temperature: agent.temperature ?? 0.3,
    maxTokens: agent.maxTokens ?? 4096,
    backgroundUrl: agent.backgroundUrl ?? "",
    enabled: agent.enabled ?? true,
  };
}

function presetToChatAgentData(preset: AgentPreset): Omit<ChatAgent, "id" | "createdAt" | "updatedAt"> {
  return {
    name: preset.name,
    role: "agent",
    runtimeKind: "langchain",
    description: preset.description || undefined,
    systemPrompt: preset.systemPrompt || undefined,
    modelProvider: preset.modelProvider || "openai-chat-completions",
    providerId: preset.providerId,
    modelId: preset.modelId,
    model: preset.modelId,
    avatarUrl: preset.avatarUrl || undefined,
    avatar: preset.avatarUrl || undefined,
    icon: preset.icon || undefined,
    workingDir: preset.workingDir,
    mcps: preset.mcps,
    skills: preset.skills,
    tools: preset.tools,
    boundWorkflowIds: preset.boundWorkflowIds,
    boundWorkflowPluginTools: preset.boundWorkflowPluginTools,
    outputStyle: preset.outputStyle || undefined,
    suggestions: preset.suggestions,
    openingMessage: preset.openingMessage ?? "",
    temperature: preset.temperature,
    maxTokens: preset.maxTokens,
    backgroundUrl: preset.backgroundUrl || undefined,
    enabled: preset.enabled,
  };
}

interface AddChatAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<ChatAgent, "id" | "createdAt" | "updatedAt">) => void;
  initialData?: ChatAgent;
  initialPreset?: AgentPreset;
}

export function AddChatAgentDialog({ open, onOpenChange, onSubmit, initialData, initialPreset }: AddChatAgentDialogProps) {
  const editorRef = useRef<AgentEditorHandle>(null);
  const isEdit = !!initialData;
  const preset = initialData ? chatAgentToPreset(initialData) : initialPreset ?? newEmptyAgent();
  const t = useTranslations('chat.addAgent');
  const [canSave, setCanSave] = useState(Boolean(preset.name.trim() && preset.providerId));

  const handleSubmit = useCallback(() => {
    const draft = editorRef.current?.getDraft();
    if (!draft || !draft.name.trim() || !draft.providerId) return;
    onSubmit(presetToChatAgentData(draft));
    onOpenChange(false);
  }, [onSubmit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] min-w-[60vw] flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AgentEditor
            ref={editorRef}
            agent={preset}
            onSaved={() => {}}
            onBack={() => onOpenChange(false)}
            showFooter={false}
            lockedFields={{ runtimeKind: true, workingDir: true }}
            fixedValues={{ runtimeKind: "langchain" }}
            onDraftChange={(draft) => setCanSave(Boolean(draft.name.trim() && draft.providerId))}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!canSave}>{t('save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
