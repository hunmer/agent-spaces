"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bot,
  Plus,
  Trash2,
  X,
  Cpu,
  FolderOpen,
  Wrench,
  Sparkles,
  MessageSquare,
  Sliders,
} from "lucide-react";

// Mock data
const MOCK_AGENTS: AgentPreset[] = [
  {
    id: "1",
    name: "Scheduler",
    role: "scheduler",
    description: "任务调度者，负责任务分发和协调",
    model: "claude-sonnet-4-6",
    workingDir: "/workspace",
    mcps: ["code-review-graph", "fetch"],
    skills: ["planning", "task-split"],
    systemPrompt:
      "你是调度者 Agent。负责接收用户任务，分析任务类型，分发给合适的执行者。你需要跟踪任务状态，确保所有子任务按时完成。",
    temperature: 0.3,
    maxTokens: 4096,
  },
  {
    id: "2",
    name: "Planner",
    role: "planner",
    description: "策划者，负责分解任务和制定计划",
    model: "claude-opus-4-7",
    workingDir: "/workspace",
    mcps: ["code-review-graph"],
    skills: ["refactoring", "tdd"],
    systemPrompt:
      "你是策划者 Agent。负责将复杂任务分解为可执行的子任务，制定详细的实施计划，识别潜在风险和依赖关系。",
    temperature: 0.5,
    maxTokens: 8192,
  },
  {
    id: "3",
    name: "Executor",
    role: "executor",
    description: "执行者，负责代码编写和修改",
    model: "claude-sonnet-4-6",
    workingDir: "/workspace/src",
    mcps: ["code-review-graph", "fetch"],
    skills: ["coding", "debugging", "testing"],
    systemPrompt:
      "你是执行者 Agent。根据计划编写高质量的代码，遵循项目编码规范，编写必要的测试。完成后提交审核。",
    temperature: 0.2,
    maxTokens: 16384,
  },
  {
    id: "4",
    name: "Reviewer",
    role: "reviewer",
    description: "审核者，负责代码审查和质量把关",
    model: "claude-opus-4-7",
    workingDir: "/workspace",
    mcps: ["code-review-graph"],
    skills: ["code-review", "security-audit"],
    systemPrompt:
      "你是审核者 Agent。负责审查代码质量、安全性和可维护性。提供具体的改进建议，确保代码符合最佳实践。",
    temperature: 0.2,
    maxTokens: 8192,
  },
];

interface AgentPreset {
  id: string;
  name: string;
  role: string;
  description: string;
  model: string;
  workingDir: string;
  mcps: string[];
  skills: string[];
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

const ROLE_COLORS: Record<string, string> = {
  scheduler: "bg-blue-500/10 text-blue-600 border-blue-200",
  planner: "bg-purple-500/10 text-purple-600 border-purple-200",
  executor: "bg-green-500/10 text-green-600 border-green-200",
  reviewer: "bg-orange-500/10 text-orange-600 border-orange-200",
};

const MODEL_OPTIONS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

export function AgentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [agents, setAgents] = useState<AgentPreset[]>(MOCK_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<AgentPreset | null>(null);
  const [editDraft, setEditDraft] = useState<AgentPreset | null>(null);

  const handleSelectAgent = (agent: AgentPreset) => {
    setSelectedAgent(agent);
    setEditDraft({ ...agent });
  };

  const handleBack = () => {
    if (editDraft && selectedAgent) {
      setAgents((prev) =>
        prev.map((a) => (a.id === editDraft.id ? { ...editDraft } : a))
      );
    }
    setSelectedAgent(null);
    setEditDraft(null);
  };

  const handleAddAgent = () => {
    const newAgent: AgentPreset = {
      id: Date.now().toString(),
      name: "New Agent",
      role: "executor",
      description: "",
      model: "claude-sonnet-4-6",
      workingDir: "/workspace",
      mcps: [],
      skills: [],
      systemPrompt: "",
      temperature: 0.3,
      maxTokens: 4096,
    };
    setAgents((prev) => [...prev, newAgent]);
    handleSelectAgent(newAgent);
  };

  const handleDeleteAgent = (id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    if (selectedAgent?.id === id) {
      setSelectedAgent(null);
      setEditDraft(null);
    }
  };

  const updateDraft = <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, [key]: value });
  };

  const addToArray = (key: "mcps" | "skills", value: string) => {
    if (!editDraft || !value.trim()) return;
    updateDraft(key, [...editDraft[key], value.trim()]);
  };

  const removeFromArray = (key: "mcps" | "skills", index: number) => {
    if (!editDraft) return;
    updateDraft(key, editDraft[key].filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleBack(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          {selectedAgent ? (
            <Button variant="ghost" size="icon-sm" onClick={handleBack}>
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="size-4 text-primary" />
            </div>
          )}
          <DialogHeader className="flex-1 space-y-0">
            <DialogTitle className="text-base">
              {selectedAgent ? editDraft?.name ?? "" : "Agent Presets"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedAgent
                ? "Configure agent behavior, tools, and model settings"
                : "Manage agent presets for workspace automation"}
            </DialogDescription>
          </DialogHeader>
          {!selectedAgent && (
            <Button variant="outline" size="sm" onClick={handleAddAgent}>
              <Plus className="size-3.5" />
              Add
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!selectedAgent ? (
            <AgentList
              agents={agents}
              onSelect={handleSelectAgent}
              onDelete={handleDeleteAgent}
            />
          ) : editDraft ? (
            <AgentDetail
              agent={editDraft}
              onChange={updateDraft}
              onAddToArray={addToArray}
              onRemoveFromArray={removeFromArray}
            />
          ) : null}
        </div>

        {/* Footer */}
        {selectedAgent && (
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" size="sm" onClick={handleBack}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleBack}>
              Save
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AgentList({
  agents,
  onSelect,
  onDelete,
}: {
  agents: AgentPreset[];
  onSelect: (agent: AgentPreset) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col p-2">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
          onClick={() => onSelect(agent)}
        >
          <div className={cn("flex size-8 items-center justify-center rounded-lg", ROLE_COLORS[agent.role] ?? "bg-muted")}>
            <Bot className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{agent.name}</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {agent.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{agent.description || "No description"}</p>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{agent.model.split("-").slice(0, 2).join("-")}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onDelete(agent.id); }}
          >
            <Trash2 className="size-3 text-destructive" />
          </Button>
        </div>
      ))}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bot className="size-10 mb-2 opacity-30" />
          <p className="text-sm">No agent presets yet</p>
        </div>
      )}
    </div>
  );
}

function AgentDetail({
  agent,
  onChange,
  onAddToArray,
  onRemoveFromArray,
}: {
  agent: AgentPreset;
  onChange: <K extends keyof AgentPreset>(key: K, value: AgentPreset[K]) => void;
  onAddToArray: (key: "mcps" | "skills", value: string) => void;
  onRemoveFromArray: (key: "mcps" | "skills", index: number) => void;
}) {
  const [newMcp, setNewMcp] = useState("");
  const [newSkill, setNewSkill] = useState("");

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Basic Info */}
      <Section icon={<MessageSquare className="size-3.5" />} title="Basic">
        <FieldGroup label="Name">
          <Input value={agent.name} onChange={(e) => onChange("name", e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Role">
          <Input value={agent.role} onChange={(e) => onChange("role", e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Description">
          <Input value={agent.description} onChange={(e) => onChange("description", e.target.value)} />
        </FieldGroup>
      </Section>

      {/* Working Directory */}
      <Section icon={<FolderOpen className="size-3.5" />} title="Working Directory">
        <Input value={agent.workingDir} onChange={(e) => onChange("workingDir", e.target.value)} placeholder="/workspace" />
      </Section>

      {/* System Prompt */}
      <Section icon={<Sparkles className="size-3.5" />} title="System Prompt">
        <Textarea
          value={agent.systemPrompt}
          onChange={(e) => onChange("systemPrompt", e.target.value)}
          placeholder="Enter system prompt..."
          className="min-h-24 text-xs"
        />
      </Section>

      {/* MCP Servers */}
      <Section icon={<Wrench className="size-3.5" />} title="MCP Servers">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agent.mcps.map((mcp, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {mcp}
              <button type="button" onClick={() => onRemoveFromArray("mcps", i)} className="hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newMcp} onChange={(e) => setNewMcp(e.target.value)} placeholder="Add MCP server..." className="flex-1 h-7 text-xs" onKeyDown={(e) => { if (e.key === "Enter") { onAddToArray("mcps", newMcp); setNewMcp(""); } }} />
          <Button variant="outline" size="xs" onClick={() => { onAddToArray("mcps", newMcp); setNewMcp(""); }}>
            <Plus className="size-3" />
          </Button>
        </div>
      </Section>

      {/* Skills */}
      <Section icon={<Cpu className="size-3.5" />} title="Skills">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agent.skills.map((skill, i) => (
            <Badge key={i} variant="outline" className="gap-1 pr-1">
              {skill}
              <button type="button" onClick={() => onRemoveFromArray("skills", i)} className="hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Add skill..." className="flex-1 h-7 text-xs" onKeyDown={(e) => { if (e.key === "Enter") { onAddToArray("skills", newSkill); setNewSkill(""); } }} />
          <Button variant="outline" size="xs" onClick={() => { onAddToArray("skills", newSkill); setNewSkill(""); }}>
            <Plus className="size-3" />
          </Button>
        </div>
      </Section>

      {/* Model Config */}
      <Section icon={<Sliders className="size-3.5" />} title="Model">
        <FieldGroup label="Model">
          <select
            value={agent.model}
            onChange={(e) => onChange("model", e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Temperature">
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
          <FieldGroup label="Max Tokens">
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

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
