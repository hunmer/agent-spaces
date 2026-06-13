"use client";

import { forwardRef, useState, useImperativeHandle } from "react";
import { useTranslations } from "next-intl";
import { type AgentConfig } from "@agent-spaces/shared";
import { useAgentStore } from "@/stores/agent";
import { sdk } from "@/lib/sdk";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  type AgentPreset,
  type AgentRole,
  type AgentDetailLockedFields,
  type AgentDetailHiddenFields,
  type BuiltInRole,
  type ConnectionTestResult,
  type McpDraft,
  ROLE_OPTIONS,
  normalizeAgent,
  serializeAgent,
  isDraftAgent,
  isAnthropicBridgeProvider,
  newAgentDraft,
} from "./agent-shared";
import { AgentDetail } from "./agent-detail";

export interface AgentEditorHandle {
  reset: () => void;
  openGenerate: () => void;
  getDraft: () => AgentPreset | null;
}

export interface AgentEditorProps {
  agent: AgentPreset;
  roleOptions?: AgentRole[];
  onSaved: (saved: AgentPreset) => void;
  onBack: () => void;
  /** Show footer save/cancel buttons. Default true */
  showFooter?: boolean;
  /** Auto-open the generate dialog on mount */
  autoOpenGenerate?: boolean;
  presetBasePath?: string;
  lockedFields?: AgentDetailLockedFields;
  fixedValues?: Partial<AgentPreset>;
  /** 持久化钩子。传入则覆盖默认保存路径（全局 AgentPreset + useAgentStore 同步），由调用方负责落盘。返回保存后的 AgentPreset。 */
  commit?: (draft: AgentPreset) => Promise<AgentPreset>;
  /** 隐藏 AgentDetail 的指定区块（整段不渲染）。与 lockedFields 正交、可叠加。 */
  hiddenFields?: AgentDetailHiddenFields;
}

export const AgentEditor = forwardRef<AgentEditorHandle, AgentEditorProps>(
  function AgentEditor(
    {
      agent: initialAgent,
      roleOptions = ROLE_OPTIONS,
      onSaved,
      onBack,
      showFooter = true,
      autoOpenGenerate = false,
      presetBasePath = "/api/agents/presets",
      lockedFields,
      fixedValues,
      commit,
      hiddenFields,
    },
    ref,
  ) {
    const t = useTranslations("agent");
    const tc = useTranslations("common");

    const [editDraft, setEditDraft] = useState<AgentPreset>({ ...initialAgent, ...fixedValues });
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);

    const [generateOpen, setGenerateOpen] = useState(autoOpenGenerate);
    const [generatePrompt, setGeneratePrompt] = useState("");
    const [generating, setGenerating] = useState(false);

    useImperativeHandle(ref, () => ({
      reset() {
        setEditDraft((draft) => {
          if (!draft) return { ...initialAgent };
          const { modelProvider, modelId, apiBase, apiKey, runtimeKind } = draft;
          return { ...initialAgent, modelProvider, modelId, apiBase, apiKey, runtimeKind, ...fixedValues };
        });
        setTestResult(null);
        setResetKey((k) => k + 1);
      },
      openGenerate() {
        setGenerateOpen(true);
      },
      getDraft() {
        return editDraft;
      },
    }));

    const handleSave = async () => {
      if (!editDraft) return;
      setSaving(true);
      setError(null);
      try {
        const nextDraft = { ...editDraft, ...fixedValues };
        if (commit) {
          const saved = await commit(nextDraft);
          onSaved(saved);
          return;
        }
        const isDraft = isDraftAgent(nextDraft);
        const createBody = serializeAgent(nextDraft);
        const raw = isDraft
          ? await sdk.agent.createPreset(createBody as unknown as Partial<AgentConfig>)
          : await sdk.agent.updatePreset(nextDraft.id, nextDraft as unknown as Partial<AgentConfig>);
        const saved = normalizeAgent(raw);
        if (presetBasePath === "/api/agents/presets") {
          useAgentStore.setState((state) => ({
            agents: isDraft
              ? [...state.agents, raw]
              : state.agents.map((a) => (a.id === raw.id ? raw : a)),
          }));
        }
        onSaved(saved);
      } catch {
        setError(t("error.saveFailed"));
      } finally {
        setSaving(false);
      }
    };

    const handleTestConnection = async () => {
      if (!editDraft) return;
      setTesting(true);
      setTestResult(null);
      setError(null);
      try {
        const data = await sdk.agent.testConnection(editDraft) as unknown as ConnectionTestResult & { error?: string };
        setTestResult({
          success: Boolean(data.success),
          message: data.message || data.error || t("error.connectionTestFailed"),
          debug: data.debug ? { ...data.debug, status: 200 } : { status: 200 },
        });
      } catch (err) {
        setTestResult({
          success: false,
          message: err instanceof Error ? err.message : t("error.connectionTestFailed"),
        });
      } finally {
        setTesting(false);
      }
    };

    const handleGenerateAgent = async () => {
      const prompt = generatePrompt.trim();
      if (!prompt) return;
      setGenerating(true);
      setError(null);
      try {
        const data = await sdk.agent.generateFromPrompt(prompt) as Partial<Pick<AgentPreset, "name" | "description" | "systemPrompt">> & { error?: string };
        if (data.error) throw new Error(data.error);
        const base = editDraft ?? newAgentDraft(roleOptions[0] as BuiltInRole ?? "agent");
        const draft: AgentPreset = {
          ...base,
          name: data.name?.trim() || base.name,
          description: data.description?.trim() || base.description,
          systemPrompt: data.systemPrompt?.trim() || base.systemPrompt,
          ...fixedValues,
        };
        setEditDraft(draft);
        setGenerateOpen(false);
        setGeneratePrompt("");
        setTestResult(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "智能创建 Agent 失败");
      } finally {
        setGenerating(false);
      }
    };

    const updateAgentDraft = <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => {
      if (lockedFields?.[key as keyof AgentDetailLockedFields]) return;
      setEditDraft((prev) => {
        if (!prev) return prev;
        if (key === "modelProvider") {
          const provider = value as AgentPreset["modelProvider"];
          return {
            ...prev,
            modelProvider: provider,
            runtimeKind: fixedValues?.runtimeKind ?? (isAnthropicBridgeProvider(provider) ? "claude-code" : prev.runtimeKind),
          };
        }
        if (key === "runtimeKind") {
          return { ...prev, runtimeKind: fixedValues?.runtimeKind ?? value as AgentPreset["runtimeKind"] };
        }
        return { ...prev, [key]: value };
      });
    };

    const updateMcpConfig = (value: McpDraft) => {
      if (lockedFields?.mcps) return;
      setEditDraft((prev) => (prev ? { ...prev, mcps: value } : prev));
    };

    return (
      <>
        {error && (
          <div className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <AgentDetail
            key={`${editDraft.id}-${resetKey}`}
            agent={editDraft}
            roleOptions={roleOptions}
            testing={testing}
            testResult={testResult}
            onChange={updateAgentDraft}
            onMcpChange={updateMcpConfig}
            onTestConnection={handleTestConnection}
            lockedFields={lockedFields}
            hiddenFields={hiddenFields}
          />
        </div>

        {showFooter && (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={onBack} disabled={saving}>
              {tc("cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? tc("saving") : tc("save")}
            </Button>
          </div>
        )}

        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>智能创建 Agent</DialogTitle>
              <DialogDescription>
                输入 Agent 的职责、使用场景和约束，系统会生成名称、描述和 Markdown 系统提示。
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              placeholder="例如：创建一个代码评审 Agent，专注发现 TypeScript/React 项目中的缺陷、回归风险和缺失测试。"
              className="min-h-32 text-sm"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleGenerateAgent} disabled={generating || !generatePrompt.trim()}>
                {generating ? "生成中..." : "生成"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);
