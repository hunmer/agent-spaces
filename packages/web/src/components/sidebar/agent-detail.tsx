"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLLMStore } from "@/stores/llm";
import {
  BUILT_IN_AGENT_TOOLS,
  type AgentConfig,
  type LLMProvider,
} from "@agent-spaces/shared";
import { AvatarUploader } from "@/components/common/avatar-uploader";
import { TagInput } from "@/components/common/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/ui/search-select";
import { ImagePickerDialog } from "@/components/ui/image-picker-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  X,
  Cpu,
  PlugZap,
  FolderOpen,
  Wrench,
  Settings2,
  Sparkles,
  MessageSquare,
  Sliders,
  WandSparkles,
  Lightbulb,
  Check,
  X as XIcon,
  Camera,
} from "lucide-react";
import { sdk } from "@/lib/sdk";
import { DiffViewer } from "@/components/git/diff-viewer";
import { ToolsDialog } from "@/components/sidebar/tools-dialog";
import { McpsDialog } from "@/components/sidebar/mcps-dialog";
import { SkillsDialog } from "@/components/sidebar/skills-dialog";
import { ProvidersDialog } from "@/components/sidebar/providers-dialog";
import {
  type AgentPreset,
  type AgentRole,
  type McpDraft,
  type ConnectionTestResult,
  type AgentDetailLockedFields,
  type AgentDetailHiddenFields,
  PROVIDER_OPTIONS,
  RUNTIME_OPTIONS,
  Section,
  FieldGroup,
  SectionHeader,
} from "./agent-shared";

export function AgentDetail({
  agent,
  roleOptions,
  testing,
  testResult,
  onChange,
  onMcpChange,
  onTestConnection,
  lockedFields,
  hiddenFields,
}: {
  agent: AgentPreset;
  roleOptions: AgentRole[];
  testing: boolean;
  testResult: ConnectionTestResult | null;
  onChange: <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => void;
  onMcpChange: (value: McpDraft) => void;
  onTestConnection: () => void;
  lockedFields?: AgentDetailLockedFields;
  hiddenFields?: AgentDetailHiddenFields;
}) {
  const t = useTranslations("agent");
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizePrompt, setOptimizePrompt] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [applyPreviewOpen, setApplyPreviewOpen] = useState(false);
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const [mcpsDialogOpen, setMcpsDialogOpen] = useState(false);
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false);
  const [providersDialogOpen, setProvidersDialogOpen] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState("");
  const [bgPickerSrc, setBgPickerSrc] = useState("");
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const tools = agent.tools ?? [];

  const { models: allLlmModels, providers: llmProviders, ensure: ensureLLM } = useLLMStore();
  const llmModels = allLlmModels.filter((m) => !m.embedding);
  const uniqueRoleOptions = Array.from(new Set(roleOptions));
  const selectedProvider = llmProviders.find((p) => p.id === agent.providerId)
    ?? llmProviders.find((p) => p.apiBase === agent.apiBase && p.apiKey === agent.apiKey);
  const dynamicModelOptions = useMemo(() => {
    if (!selectedProvider) return [];
    return llmModels
      .filter((m) => m.provider === selectedProvider.name)
      .map((m) => ({ value: m.modelId, label: m.name }));
  }, [selectedProvider, llmModels]);

  useEffect(() => {
    ensureLLM();
  }, [ensureLLM]);

  // 当 provider 确定后（自动匹配或手动选择），将其连接字段同步到 agent。
  // apiBase / apiKey / modelProvider 在 UI 上是 disabled，只能由 provider 决定，
  // 因此只要 selectedProvider 存在，就保证这些字段与 provider 一致。
  useEffect(() => {
    if (!selectedProvider) return;
    if (!agent.providerId) {
      onChange("providerId", selectedProvider.id);
    }
    if (agent.apiBase !== selectedProvider.apiBase) {
      onChange("apiBase", selectedProvider.apiBase);
    }
    if (agent.apiKey !== selectedProvider.apiKey) {
      onChange("apiKey", selectedProvider.apiKey);
    }
    const nextModelProvider = (selectedProvider.modelProvider || "") as AgentPreset["modelProvider"];
    if (agent.modelProvider !== nextModelProvider) {
      onChange("modelProvider", nextModelProvider);
    }
  }, [agent.providerId, agent.apiBase, agent.apiKey, agent.modelProvider, onChange, selectedProvider]);

  const handleSelectProvider = useCallback(
    (provider: LLMProvider) => {
      onChange("providerId", provider.id);
      onChange("apiBase", provider.apiBase);
      onChange("apiKey", provider.apiKey);
      onChange("modelProvider", (provider.modelProvider || "") as AgentPreset["modelProvider"]);
      const providerModels = llmModels.filter((m) => m.provider === provider.name);
      if (providerModels.length > 0) {
        onChange("modelId", providerModels[0].modelId);
      }
    },
    [llmModels, onChange],
  );

  const handleOptimizePrompt = async () => {
    const prompt = optimizePrompt.trim();
    if (!prompt) return;

    setOptimizing(true);
    setOptimizationError(null);
    try {
      const data = await sdk.agent.optimizePrompt(prompt, agent.systemPrompt);
      if (data.error) throw new Error(data.error);
      setOptimizedPrompt(data.systemPrompt?.trim() || "");
      setPreviewPrompt(agent.systemPrompt);
      setOptimizeOpen(false);
      setApplyPreviewOpen(true);
    } catch (err) {
      setOptimizationError(err instanceof Error ? err.message : "优化提示词失败");
    } finally {
      setOptimizing(false);
    }
  };

  const handleApplyOptimizedPrompt = () => {
    if (!optimizedPrompt.trim()) return;
    onChange("systemPrompt", optimizedPrompt);
    setApplyPreviewOpen(false);
    setOptimizedPrompt("");
    setPreviewPrompt("");
    setOptimizePrompt("");
  };

  const closeOptimizeDialog = (open: boolean) => {
    setOptimizeOpen(open);
    if (!open && !optimizing) {
      setOptimizePrompt("");
      setOptimizationError(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5 p-5">
      <Section icon={<MessageSquare className="size-3.5" />} title={t("detail.basic")}>
        {/* Background + Avatar + Name/Role layout */}
        <div className="flex flex-col">
          <div className="relative h-24 rounded-t-xl bg-muted overflow-hidden group">
            {agent.backgroundUrl ? (
              <>
                <img
                  src={agent.backgroundUrl}
                  alt="Background"
                  className="size-full object-cover"
                />
                {!hiddenFields?.background && (
                <button
                  type="button"
                  className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-black/70"
                  onClick={() => onChange("backgroundUrl", "")}
                >
                  <X className="size-3" />
                </button>
                )}
              </>
            ) : (
              <div className="size-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <span className="text-xs text-muted-foreground">Default background</span>
              </div>
            )}
            {/* Upload background button — hiddenFields.background 时不开启上传 */}
            {!hiddenFields?.background && (
            <label className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70">
              <Camera className="size-3" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    setBgPickerSrc(reader.result as string);
                    setBgPickerOpen(true);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </label>
            )}
          </div>
          {/* Avatar + Name/Row row: avatar overlaps background bottom */}
          <div className="flex items-end gap-4 px-4 -mt-6">
            <div className="relative shrink-0">
              <AvatarUploader
                name={agent.name}
                avatarUrl={agent.avatarUrl}
                icon={agent.icon}
                apiBase={agent.apiBase}
                onAvatarUrlChange={(url) => onChange("avatarUrl", url)}
                onIconChange={(icon) => onChange("icon", icon)}
                hideUploadLabel
              />
            </div>
            <div className="flex flex-1 items-center gap-3 pb-1">
              <Input
                value={agent.name}
                onChange={(e) => onChange("name", e.target.value)}
                className="h-7 flex-1 text-sm font-medium border-0 px-0 shadow-none focus-visible:ring-0"
                placeholder={t("detail.name")}
              />
              {!hiddenFields?.role && (
              <select
                value={agent.role}
                onChange={(e) => onChange("role", e.target.value as AgentConfig["role"])}
                disabled={lockedFields?.role}
                className="h-6 w-auto shrink-0 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring dark:bg-input/30"
              >
                {uniqueRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              )}
            </div>
          </div>
        </div>
        <FieldGroup label={t("detail.description")}>
          <Input value={agent.description} onChange={(e) => onChange("description", e.target.value)} />
        </FieldGroup>
        <FieldGroup label={t("detail.agentRuntime")}>
          <SearchSelect
            value={agent.runtimeKind ?? ""}
            onChange={(v) => onChange("runtimeKind", v as NonNullable<AgentConfig["runtimeKind"]>)}
            options={RUNTIME_OPTIONS.map((option) => ({ value: option.value, label: t(`runtime.${option.labelKey}`) }))}
            placeholder={t("detail.runtimePlaceholder")}
            searchPlaceholder={t("detail.runtimeSearchPlaceholder")}
            allowCustom={false}
            disabled={lockedFields?.runtimeKind}
          />
        </FieldGroup>
      </Section>

      {!hiddenFields?.workingDir && (
      <Section icon={<FolderOpen className="size-3.5" />} title={t("detail.workingDirectory")}>
        <Input value={agent.workingDir} onChange={(e) => onChange("workingDir", e.target.value)} placeholder={t("detail.workingDirPlaceholder")} disabled={lockedFields?.workingDir} />
      </Section>
      )}

      {!hiddenFields?.systemPrompt && (
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          icon={<Sparkles className="size-3.5" />}
          title={t("detail.systemPrompt")}
          action={
            lockedFields?.systemPrompt ? null : <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setOptimizeOpen(true)}>
              <WandSparkles className="size-3.5" />
              {t("detail.optimizePrompt")}
            </Button>
          }
        />
        <Textarea
          value={agent.systemPrompt}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
          placeholder={t("detail.systemPromptPlaceholder")}
          className="min-h-24 text-xs"
          disabled={lockedFields?.systemPrompt}
        />
      </div>
      )}

      {!hiddenFields?.outputStyle && (
      <Section icon={<Sparkles className="size-3.5" />} title={t("detail.outputStyle")}>
        <Textarea
          value={agent.outputStyle}
          onChange={(e) => onChange("outputStyle", e.target.value)}
          placeholder={t("detail.outputStylePlaceholder")}
          className="min-h-24 text-xs"
        />
      </Section>
      )}

      <Section icon={<Lightbulb className="size-3.5" />} title={t("detail.suggestions")}>
        <TagInput
          value={agent.suggestions ?? []}
          onChange={(v) => onChange("suggestions", v)}
          placeholder={t("detail.suggestionsPlaceholder")}
          addLabel={t("detail.suggestionsAdd")}
        />
      </Section>

      {!hiddenFields?.mcps && (
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          icon={<Wrench className="size-3.5" />}
          title={t("detail.mcpServers")}
          action={
            lockedFields?.mcps ? null : <Button variant="ghost" size="icon" className="size-5" onClick={() => setMcpsDialogOpen(true)}>
              <Settings2 className="size-3.5" />
            </Button>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {(() => {
            const mcpNames = Object.keys((agent.mcps as Record<string, Record<string, unknown>>)?.mcpServers ?? {});
            return mcpNames.length > 0 ? (
              mcpNames.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-foreground">
                  {name}
                  {!lockedFields?.mcps ? (
                    <button
                      type="button"
                      onClick={() => {
                        const servers = { ...((agent.mcps as Record<string, Record<string, unknown>>)?.mcpServers ?? {}) };
                        delete servers[name];
                        onMcpChange({ ...(agent.mcps as Record<string, unknown>), mcpServers: servers });
                      }}
                      className="hover:text-destructive cursor-pointer"
                    >
                      <X className="size-2.5" />
                    </button>
                  ) : null}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">{t("detail.noMcps")}</span>
            );
          })()}
        </div>
        <McpsDialog
          open={mcpsDialogOpen}
          onOpenChange={setMcpsDialogOpen}
          selectable
          selectedMcps={Object.keys((agent.mcps as Record<string, Record<string, unknown>>)?.mcpServers ?? {})}
          onSelectedMcpsChange={(names, configs) => {
            const oldServers = (agent.mcps as Record<string, Record<string, unknown>>)?.mcpServers ?? {};
            const newServers: Record<string, unknown> = {};
            for (const name of names) {
              const oldConfig = (oldServers as Record<string, unknown>)[name];
              newServers[name] = isRunnableMcpConfig(oldConfig) ? oldConfig : configs[name] ?? oldConfig ?? {};
            }
            onMcpChange({ ...(agent.mcps as Record<string, unknown>), mcpServers: newServers });
          }}
        />
      </div>
      )}

      {!hiddenFields?.tools && (
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          icon={<Wrench className="size-3.5" />}
          title={t("detail.tools")}
          action={
            lockedFields?.tools ? null : <Button variant="ghost" size="icon" className="size-5" onClick={() => setToolsDialogOpen(true)}>
              <Settings2 className="size-3.5" />
            </Button>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {tools.length > 0 ? (
            tools.map((tool) => {
              const builtIn = BUILT_IN_AGENT_TOOLS.find((t) => t.name === tool);
              return (
                <span key={tool} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-foreground">
                  {builtIn?.label ?? tool}
                  {!lockedFields?.tools ? (
                    <button type="button" onClick={() => onChange("tools", tools.filter((t) => t !== tool))} className="hover:text-destructive cursor-pointer">
                      <X className="size-2.5" />
                    </button>
                  ) : null}
                </span>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">{t("detail.noTools")}</span>
          )}
        </div>
        <ToolsDialog
          open={toolsDialogOpen}
          onOpenChange={setToolsDialogOpen}
          selectable
          selectedTools={tools}
          onSelectedToolsChange={(tools) => onChange("tools", tools)}
        />
      </div>
      )}

      {!hiddenFields?.skills && (
      <div className="flex flex-col gap-2.5">
        <SectionHeader
          icon={<Cpu className="size-3.5" />}
          title={t("detail.skills")}
          action={
            lockedFields?.skills ? null : <Button variant="ghost" size="icon" className="size-5" onClick={() => setSkillsDialogOpen(true)}>
              <Settings2 className="size-3.5" />
            </Button>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {agent.skills.length > 0 ? (
            agent.skills.map((skill) => (
              <span key={skill.name} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-foreground">
                {skill.name}
                {!lockedFields?.skills ? (
                  <button type="button" onClick={() => onChange("skills", agent.skills.filter((s) => s.name !== skill.name))} className="hover:text-destructive cursor-pointer">
                    <X className="size-2.5" />
                  </button>
                ) : null}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">{t("detail.noSkills")}</span>
          )}
        </div>
        <SkillsDialog
          open={skillsDialogOpen}
          onOpenChange={setSkillsDialogOpen}
          selectable
          selectedSkills={agent.skills.map((s) => s.name)}
          onSelectedSkillsChange={(names) => onChange("skills", names.map((name) => ({ name })))}
        />
      </div>
      )}

      <Section icon={<Sliders className="size-3.5" />} title={t("detail.model")}>
        <div className="space-y-2.5">
          <FieldGroup label={t("detail.provider")}>
            <div className="flex items-center gap-2">
              <SearchSelect
                value={selectedProvider?.name || ""}
                onChange={(v) => {
                  const provider = llmProviders.find((p) => p.name === v);
                  if (provider) handleSelectProvider(provider);
                }}
                options={llmProviders.map((p) => ({ value: p.name, label: p.name }))}
                placeholder={t("detail.providerPlaceholder")}
                searchPlaceholder={t("detail.providerSearchPlaceholder")}
                allowCustom={false}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setProvidersDialogOpen(true)}
                title={t("detail.manageProviders")}
              >
                <Settings2 className="size-3.5" />
              </Button>
            </div>
          </FieldGroup>
          <FieldGroup label={t("detail.modelField")}>
            <SearchSelect
              value={agent.modelId}
              onChange={(v) => onChange("modelId", v)}
              options={dynamicModelOptions.length > 0 ? dynamicModelOptions : [{ value: agent.modelId || "", label: agent.modelId || t("detail.selectProviderFirst") }]}
              placeholder={t("detail.modelPlaceholder")}
              searchPlaceholder={t("detail.modelSearchPlaceholder")}
              disabled={!selectedProvider}
            />
          </FieldGroup>
          <FieldGroup label={t("detail.apiMessageType")}>
            <SearchSelect
              value={agent.modelProvider || ""}
              onChange={(v) => onChange("modelProvider", v as AgentPreset["modelProvider"])}
              options={PROVIDER_OPTIONS.map((option) => ({ value: option.value, label: t(`provider.${option.labelKey}`) }))}
              placeholder={t("detail.apiMessageTypePlaceholder")}
              searchPlaceholder={t("detail.apiMessageTypeSearchPlaceholder")}
              allowCustom={false}
              disabled
            />
          </FieldGroup>
          <FieldGroup label={t("detail.apiBase")}>
            <Input value={agent.apiBase} onChange={(e) => onChange("apiBase", e.target.value)} placeholder={t("detail.apiBasePlaceholder")} className="h-7 text-xs" disabled />
          </FieldGroup>
          <FieldGroup label={t("detail.apiKey")}>
            <Input type="password" value={agent.apiKey} onChange={(e) => onChange("apiKey", e.target.value)} placeholder={t("detail.apiKeyPlaceholder")} className="h-7 text-xs" disabled />
          </FieldGroup>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">{t("detail.validateHelper")}</div>
          <Button type="button" variant="outline" size="sm" onClick={onTestConnection} disabled={testing || !selectedProvider || !agent.modelId}>
            <PlugZap className="size-3.5" />
            {testing ? t("detail.testing") : t("detail.test")}
          </Button>
        </div>
        {testResult && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              testResult.success ? "border-green-500/30 bg-green-500/10 text-green-700" : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {testResult.message}
            {testResult.debug && (
              <div className="mt-2 space-y-1 font-mono text-[10px] opacity-80">
                {testResult.debug.status && <div>{t("debug.status")} {testResult.debug.status}</div>}
                {testResult.debug.provider && <div>{t("debug.provider")} {testResult.debug.provider}</div>}
                {testResult.debug.requestUrl && <div>{t("debug.url")} {testResult.debug.requestUrl}</div>}
                {testResult.debug.model && <div>{t("debug.model")} {testResult.debug.model}</div>}
                {testResult.debug.responseBody && <div className="max-h-20 overflow-auto whitespace-pre-wrap">{t("debug.body")} {testResult.debug.responseBody}</div>}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label={t("detail.temperature")}>
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
              <span className="w-8 text-right font-mono text-xs">{agent.temperature}</span>
            </div>
          </FieldGroup>
          <FieldGroup label={t("detail.maxTokens")}>
            <Input type="number" value={agent.maxTokens} onChange={(e) => onChange("maxTokens", parseInt(e.target.value) || 0)} className="h-7 text-xs" />
          </FieldGroup>
        </div>
      </Section>

      <Dialog open={optimizeOpen} onOpenChange={closeOptimizeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("detail.optimizePrompt")}</DialogTitle>
            <DialogDescription>{t("detail.optimizePromptDescription")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={optimizePrompt}
            onChange={(e) => setOptimizePrompt(e.target.value)}
            placeholder={t("detail.optimizePromptPlaceholder")}
            className="min-h-32 text-sm"
          />
          {optimizationError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {optimizationError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => closeOptimizeDialog(false)} disabled={optimizing}>
              {t("detail.cancel")}
            </Button>
            <Button onClick={handleOptimizePrompt} disabled={optimizing || !optimizePrompt.trim()}>
              {optimizing ? t("detail.optimizing") : t("detail.optimizeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyPreviewOpen} onOpenChange={setApplyPreviewOpen}>
        <DialogContent className="!w-[min(92vw,1200px)] !max-w-[min(92vw,1200px)] !h-[85vh] flex flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>{t("detail.optimizePreviewTitle")}</DialogTitle>
            <DialogDescription>{t("detail.optimizePreviewDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            <div className="min-h-0 border-b lg:border-b-0 lg:border-r">
              <DiffViewer oldContent={previewPrompt} newContent={optimizedPrompt} path="system-prompt.md" />
            </div>
            <div className="flex min-h-0 flex-col border-t lg:border-t-0">
              <div className="border-b px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("detail.optimizeRequest")}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{optimizePrompt}</div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("detail.optimizedPrompt")}</div>
                <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">{optimizedPrompt}</pre>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t m-1">
            <Button variant="outline" onClick={() => setApplyPreviewOpen(false)}>
              <XIcon className="size-3.5" />
              {t("detail.cancel")}
            </Button>
            <Button onClick={handleApplyOptimizedPrompt}>
              <Check className="size-3.5" />
              {t("detail.applyOptimizedPrompt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImagePickerDialog
        src={bgPickerSrc}
        open={bgPickerOpen}
        onOpenChange={setBgPickerOpen}
        onCropComplete={(dataUrl) => onChange("backgroundUrl", dataUrl)}
        defaultAspect={16 / 9}
      />

      <ProvidersDialog
        open={providersDialogOpen}
        onOpenChange={setProvidersDialogOpen}
        onAddModel={() => {}}
      />
    </div>
  );
}

function isRunnableMcpConfig(config: unknown): config is Record<string, unknown> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const record = config as Record<string, unknown>;
  return typeof record.command === "string" && record.command.trim().length > 0
    || typeof record.url === "string" && record.url.trim().length > 0;
}
