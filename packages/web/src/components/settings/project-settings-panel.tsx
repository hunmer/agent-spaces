'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useChannelStore } from '@/stores/channel';
import { useIssueStore } from '@/stores/issue';
import { FolderOpen, Hash, ListChecks, Loader2 } from 'lucide-react';
import type { Workspace } from '@agent-spaces/shared';

interface ProjectSettingsPanelProps {
  workspaceId: string;
}

export function ProjectSettingsPanel({ workspaceId }: ProjectSettingsPanelProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [prompt, setPrompt] = useState('');
  const [savedPrompt, setSavedPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  const channels = useChannelStore((s) => s.channels);
  const issues = useIssueStore((s) => s.issues);
  const loadChannels = useChannelStore((s) => s.loadChannels);
  const loadIssues = useIssueStore((s) => s.loadIssues);

  useEffect(() => {
    Promise.all([
      fetch(`/api/workspaces/${workspaceId}`).then((r) => r.json()),
      fetch(`/api/workspaces/${workspaceId}/prompt`).then((r) => r.json()),
      loadChannels(workspaceId),
      loadIssues(workspaceId),
    ])
      .then(([ws, promptData]) => {
        setWorkspace(ws);
        setPrompt(promptData.prompt ?? '');
        setSavedPrompt(promptData.prompt ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workspaceId, loadChannels, loadIssues]);

  const autoProcessIssues = workspace?.autoProcessIssues !== false;
  const promptChanged = prompt !== savedPrompt;

  const handleToggleAutoProcess = async (checked: boolean) => {
    if (!workspace || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoProcessIssues: checked }),
      });
      const updated: Workspace = await res.json();
      setWorkspace(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    if (savingPrompt) return;
    setSavingPrompt(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data: { prompt: string } = await res.json();
      setPrompt(data.prompt);
      setSavedPrompt(data.prompt);
    } finally {
      setSavingPrompt(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Workspace not found
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div>
          <h3 className="text-sm font-semibold">Project Settings</h3>
          <p className="text-xs text-muted-foreground mt-1">{workspace.name}</p>
        </div>

        {/* Basic Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Info</h4>

          <InfoRow icon={<FolderOpen size={14} />} label="Path" value={workspace.boundDirs[0] ?? '-'} />

          <InfoRow icon={<Hash size={14} />} label="Channels" value={String(channels.length)} />

          <InfoRow icon={<ListChecks size={14} />} label="Issues" value={String(issues.length)} />
        </div>

        {/* Automation */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Automation</h4>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="auto-process" className="text-sm font-medium">
                Auto Process Issues
              </Label>
              <p className="text-xs text-muted-foreground">
                Scheduler will automatically plan and execute open issues
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              <Switch
                id="auto-process"
                checked={autoProcessIssues}
                onCheckedChange={handleToggleAutoProcess}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        {/* Prompt */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prompt</h4>

          <div className="space-y-3 rounded-md border px-3 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="workspace-prompt" className="text-sm font-medium">
                Workspace Prompt
              </Label>
              <p className="text-xs text-muted-foreground">
                Applied to every agent run in this workspace
              </p>
            </div>
            <Textarea
              id="workspace-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-36 resize-y text-sm"
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={handleSavePrompt} disabled={savingPrompt || !promptChanged}>
                {savingPrompt && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save Prompt
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate text-foreground ml-auto" title={value}>{value}</span>
    </div>
  );
}
