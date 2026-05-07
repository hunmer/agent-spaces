"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useLLMStore } from "@/stores/llm";
import {
  BUILT_IN_AGENT_TOOLS,
  type AgentConfig,
  type BuiltInAgentToolName,
  type LLMProvider,
} from "@agent-spaces/shared";
import { AgentIcon } from "@/components/common/agent-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/ui/search-select";
import { cn } from "@/lib/utils";
import {
  X,
  Cpu,
  PlugZap,
  FolderOpen,
  Wrench,
  Sparkles,
  MessageSquare,
  Sliders,
  Upload,
} from "lucide-react";
import {
  type AgentPreset,
  type AgentRole,
  type McpDraft,
  type SkillDraft,
  type ConnectionTestResult,
  PROVIDER_OPTIONS,
  RUNTIME_OPTIONS,
  isAnthropicBridgeProvider,
  Section,
  FieldGroup,
} from "./agent-shared";

export function AgentDetail({
  agent,
  roleOptions,
  testing,
  testResult,
  onChange,
  onMcpChange,
  onAddSkillFiles,
  onRemoveSkill,
  onTestConnection,
}: {
  agent: AgentPreset;
  roleOptions: AgentRole[];
  testing: boolean;
  testResult: ConnectionTestResult | null;
  onChange: <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => void;
  onMcpChange: (value: McpDraft) => void;
  onAddSkillFiles: (files: SkillDraft[]) => void;
  onRemoveSkill: (index: number) => void;
  onTestConnection: () => void;
}) {
  const t = useTranslations('agent');
  const [mcpJson, setMcpJson] = useState(() => JSON.stringify(agent.mcps, null, 2));
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [dynamicModelOptions, setDynamicModelOptions] = useState<Array<{ value: string; label: string }>>([]);

  const { models: allLlmModels, providers: llmProviders, ensure: ensureLLM } = useLLMStore();
  const llmModels = allLlmModels.filter((m) => !m.embedding);

  useEffect(() => { ensureLLM(); }, [ensureLLM]);

  const handleSelectProvider = useCallback(
    (provider: LLMProvider) => {
      onChange("apiBase", provider.apiBase);
      onChange("apiKey", provider.apiKey);
      const providerModels = llmModels.filter((m) => m.provider === provider.name);
      const options = providerModels.map((m) => ({ value: m.modelId, label: m.name }));
      setDynamicModelOptions(options);
      if (options.length > 0) {
        onChange("modelId", options[0].value);
      }
    },
    [llmModels, onChange],
  );

  const handleMcpJsonChange = (value: string) => {
    setMcpJson(value);
    try {
      const parsed = JSON.parse(value) as McpDraft;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("MCP config must be a JSON object");
      }
      setMcpError(null);
      onMcpChange(parsed);
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleSkillUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const markdownFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".md"));
    const next = await Promise.all(markdownFiles.map(async (file) => ({
      name: file.name,
      content: await file.text(),
    })));
    onAddSkillFiles(next);
  };

  const toggleTool = (toolName: BuiltInAgentToolName) => {
    const selected = new Set(agent.tools);
    if (selected.has(toolName)) {
      selected.delete(toolName);
    } else {
      selected.add(toolName);
    }
    onChange("tools", (BUILT_IN_AGENT_TOOLS ?? []).map((tool) => tool.name).filter((name) => selected.has(name)));
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Basic Info */}
      <Section icon={<MessageSquare className="size-3.5" />} title={t('detail.basic')}>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <AgentIcon
              name={agent.name}
              avatarUrl={agent.avatarUrl}
              apiBase={agent.apiBase}
              className="size-16 rounded-xl border border-input"
            />
            <label className="text-[10px] text-primary cursor-pointer hover:underline">
              {t('detail.uploadAvatar')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async () => {
                    try {
                      const res = await fetch("/api/upload/avatar", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dataUrl: reader.result, filename: file.name }),
                      });
                      const data = await res.json();
                      if (data.url) onChange("avatarUrl", data.url);
                    } catch { /* ignore */ }
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </label>
            {agent.avatarUrl && (
              <button
                type="button"
                className="text-[10px] text-destructive hover:underline"
                onClick={() => onChange("avatarUrl", "")}
              >
                {t('detail.removeAvatar')}
              </button>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2.5">
            <FieldGroup label={t('detail.name')}>
              <Input value={agent.name} onChange={(e) => onChange("name", e.target.value)} />
            </FieldGroup>
            <FieldGroup label={t('detail.role')}>
              <select
                value={agent.role}
                onChange={(e) => onChange("role", e.target.value as AgentConfig["role"])}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </FieldGroup>
          </div>
        </div>
        <FieldGroup label={t('detail.description')}>
          <Input value={agent.description} onChange={(e) => onChange("description", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t('detail.agentRuntime')}>
          <SearchSelect
            value={agent.runtimeKind ?? ""}
            onChange={(v) => onChange("runtimeKind", v as NonNullable<AgentConfig["runtimeKind"]>)}
            options={RUNTIME_OPTIONS.map((option) => ({ value: option.value, label: t(`runtime.${option.labelKey}`) }))}
            placeholder={t('detail.runtimePlaceholder')}
            searchPlaceholder={t('detail.runtimeSearchPlaceholder')}
            allowCustom={false}
          />
        </FieldGroup>
      </Section>

      {/* Working Directory */}
      <Section icon={<FolderOpen className="size-3.5" />} title={t('detail.workingDirectory')}>
        <Input value={agent.workingDir} onChange={(e) => onChange("workingDir", e.target.value)} placeholder={t('detail.workingDirPlaceholder')} />
      </Section>

      {/* System Prompt */}
      <Section icon={<Sparkles className="size-3.5" />} title={t('detail.systemPrompt')}>
        <Textarea
          value={agent.systemPrompt}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
          placeholder={t('detail.systemPromptPlaceholder')}
          className="min-h-24 text-xs"
        />
      </Section>

      {/* MCP Servers */}
      <Section icon={<Wrench className="size-3.5" />} title={t('detail.mcpServers')}>
        <Textarea
          value={mcpJson}
          onChange={(e) => handleMcpJsonChange(e.target.value)}
          placeholder={'{\n  "mcpServers": {}\n}'}
          className="min-h-28 font-mono text-xs"
        />
        {mcpError && (
          <div className="text-xs text-destructive">{mcpError}</div>
        )}
      </Section>

      {/* Tools */}
      <Section icon={<Wrench className="size-3.5" />} title={t('detail.tools')}>
        <div className="grid gap-2">
          {(BUILT_IN_AGENT_TOOLS ?? []).map((tool) => (
            <label
              key={tool.name}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-input px-3 py-2 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={agent.tools.includes(tool.name)}
                onChange={() => toggleTool(tool.name)}
                className="mt-0.5 size-3.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{tool.label}</span>
                <span className="block text-[11px] text-muted-foreground">{tool.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {/* Skills */}
      <Section icon={<Cpu className="size-3.5" />} title={t('detail.skills')}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agent.skills.map((skill, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-foreground">
              {skill.name}
              <button type="button" onClick={() => onRemoveSkill(i)} className="hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
        <label className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-input text-xs text-muted-foreground hover:bg-muted/50">
          <Upload className="size-3.5" />
          {t('detail.uploadSkills')}
          <input
            type="file"
            accept=".md,text/markdown"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleSkillUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </Section>

      {/* Model Config */}
      <Section icon={<Sliders className="size-3.5" />} title={t('detail.model')}>
        <div className="space-y-2.5">
          <FieldGroup label={t('detail.provider')}>
            <SearchSelect
              value={llmProviders.find((p) => p.apiBase === agent.apiBase && p.apiKey === agent.apiKey)?.name || ""}
              onChange={(v) => {
                const provider = llmProviders.find((p) => p.name === v);
                if (provider) handleSelectProvider(provider);
              }}
              options={llmProviders.map((p) => ({ value: p.name, label: p.name }))}
              placeholder={t('detail.providerPlaceholder')}
              searchPlaceholder={t('detail.providerSearchPlaceholder')}
              allowCustom={false}
            />
          </FieldGroup>
          <FieldGroup label={t('detail.modelField')}>
            <SearchSelect
              value={agent.modelId}
              onChange={(v) => onChange("modelId", v)}
              options={dynamicModelOptions.length > 0 ? dynamicModelOptions : [{ value: agent.modelId || "", label: agent.modelId || t('detail.selectProviderFirst') }]}
              placeholder={t('detail.modelPlaceholder')}
              searchPlaceholder={t('detail.modelSearchPlaceholder')}
            />
          </FieldGroup>
          <FieldGroup label={t('detail.apiMessageType')}>
            <SearchSelect
              value={agent.modelProvider || ""}
              onChange={(v) => onChange("modelProvider", v as AgentPreset["modelProvider"])}
              options={PROVIDER_OPTIONS.map((option) => ({ value: option.value, label: t(`provider.${option.labelKey}`) }))}
              placeholder={t('detail.apiMessageTypePlaceholder')}
              searchPlaceholder={t('detail.apiMessageTypeSearchPlaceholder')}
              allowCustom={false}
            />
          </FieldGroup>
          <FieldGroup label={t('detail.apiBase')}>
            <Input
              value={agent.apiBase}
              onChange={(e) => onChange("apiBase", e.target.value)}
              placeholder={t('detail.apiBasePlaceholder')}
              className="h-7 text-xs"
            />
          </FieldGroup>
          <FieldGroup label={t('detail.apiKey')}>
            <Input
              type="password"
              value={agent.apiKey}
              onChange={(e) => onChange("apiKey", e.target.value)}
              placeholder={t('detail.apiKeyPlaceholder')}
              className="h-7 text-xs"
            />
          </FieldGroup>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">{t('detail.validateHelper')}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTestConnection}
            disabled={testing || !agent.apiBase || !agent.apiKey || !agent.modelId}
          >
            <PlugZap className="size-3.5" />
            {testing ? t('detail.testing') : t('detail.test')}
          </Button>
        </div>
        {testResult && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              testResult.success
                ? "border-green-500/30 bg-green-500/10 text-green-700"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {testResult.message}
            {testResult.debug && (
              <div className="mt-2 space-y-1 font-mono text-[10px] opacity-80">
                {testResult.debug.status && <div>{t('debug.status')} {testResult.debug.status}</div>}
                {testResult.debug.provider && <div>{t('debug.provider')} {testResult.debug.provider}</div>}
                {testResult.debug.requestUrl && <div>{t('debug.url')} {testResult.debug.requestUrl}</div>}
                {testResult.debug.model && <div>{t('debug.model')} {testResult.debug.model}</div>}
                {testResult.debug.responseBody && (
                  <div className="max-h-20 overflow-auto whitespace-pre-wrap">{t('debug.body')} {testResult.debug.responseBody}</div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label={t('detail.temperature')}>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={agent.temperature}
                onChange={(e) => onChange("temperature", parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs font-mono w-8 text-right">{agent.temperature}</span>
            </div>
          </FieldGroup>
          <FieldGroup label={t('detail.maxTokens')}>
            <Input
              type="number"
              value={agent.maxTokens}
              onChange={(e) => onChange("maxTokens", parseInt(e.target.value) || 0)}
              className="h-7 text-xs"
            />
          </FieldGroup>
        </div>
      </Section>
    </div>
  );
}
