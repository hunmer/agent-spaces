'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Bot, Wrench, Plug, FileText, Sparkles, ChevronDown, Settings } from 'lucide-react';
import { useAgentStore } from '@/stores/agent';
import { AgentIcon } from '@/components/common/agent-icon';
import { useUserAvatar } from '@/hooks/use-user-avatar';
import { useTranslations } from 'next-intl';
import type { AgentConfig } from '@agent-spaces/shared';

const RUNTIME_LABELS: Record<string, string> = {
  'open-agent-sdk': 'OpenAgent SDK',
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'langchain': 'LangChain',
  'hermes': 'Hermes',
};

const PROVIDER_LABELS: Record<string, string> = {
  'anthropic-messages': 'Anthropic',
  'openai-chat-completions': 'OpenAI Chat',
  'openai-responses': 'OpenAI Responses',
  'openai-responses-to-anthropic-messages': 'OpenAI → Anthropic',
  'openai-chat-completions-to-anthropic-messages': 'OpenAI Chat → Anthropic',
  'gemini-generate-content': 'Gemini',
};

function InfoRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function CollapsibleTagList({ items }: { items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const t = useTranslations('chat.memberInfoCard');

  const checkOverflow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, []);

  useEffect(() => { checkOverflow(); }, [checkOverflow, items]);

  return (
    <div>
      <div
        ref={containerRef}
        className={`flex flex-wrap gap-1 ${!expanded ? 'max-h-[3rem] overflow-hidden' : ''}`}
      >
        {items.map((item) => (
          <span key={item} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{item}</span>
        ))}
      </div>
      {overflows && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? t('collapse') : t('expandAll')}
        </button>
      )}
    </div>
  );
}

function AgentDetails({ agent }: { agent: Partial<AgentConfig> }) {
  const t = useTranslations('chat.memberInfoCard');
  return (
    <div className="space-y-2">
      {agent.description && (
        <InfoRow icon={Bot} label={t('description')}>
          <span className="text-foreground">{agent.description}</span>
        </InfoRow>
      )}
      {agent.systemPrompt && (
        <InfoRow icon={FileText} label={t('prompt')}>
          <p className="line-clamp-3 text-muted-foreground whitespace-pre-wrap">{agent.systemPrompt}</p>
        </InfoRow>
      )}
      {agent.skills && agent.skills.length > 0 && (
        <InfoRow icon={Sparkles} label={t('skills')}>
          <CollapsibleTagList items={agent.skills} />
        </InfoRow>
      )}
      {agent.tools && agent.tools.length > 0 && (
        <InfoRow icon={Wrench} label={t('tools')}>
          <CollapsibleTagList items={agent.tools} />
        </InfoRow>
      )}
      {agent.mcps && Object.keys(agent.mcps).length > 0 && (
        <InfoRow icon={Plug} label={t('mcp')}>
          <CollapsibleTagList items={Object.keys(agent.mcps)} />
        </InfoRow>
      )}
    </div>
  );
}

export interface MemberInfoCardProps {
  agentId: string;
  displayName?: string;
  channels?: string[];
  compact?: boolean;
  onConfigure?: () => void;
  agent?: Partial<AgentConfig>;
}

export function MemberInfoCard({ agentId, displayName, channels = [], compact = false, onConfigure, agent: fallbackAgent }: MemberInfoCardProps) {
  const storeAgent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));
  const agent = storeAgent ? { ...fallbackAgent, ...storeAgent } : fallbackAgent;
  const t = useTranslations('chat.memberInfoCard');
  const resolvedName = displayName || agent?.name || agentId;

  const badges: { label: string; variant?: string }[] = [];
  if (agent?.runtimeKind) badges.push({ label: RUNTIME_LABELS[agent.runtimeKind] || agent.runtimeKind });
  if (agent?.modelProvider) badges.push({ label: PROVIDER_LABELS[agent.modelProvider] || agent.modelProvider });
  if (agent?.modelId) badges.push({ label: agent.modelId, variant: 'mono' });

  const backgroundSrc = agent?.backgroundUrl || '';

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      {/* Background + Avatar header */}
      {!compact && (
        <div className="flex flex-col">
          <div className="relative h-24 rounded-t-xl bg-muted overflow-hidden">
            {backgroundSrc ? (
              <img src={backgroundSrc} alt="" className="size-full object-cover" />
            ) : (
              <div className="size-full bg-gradient-to-br from-muted to-muted/50" />
            )}
            {agent && onConfigure && (
              <button
                onClick={(e) => { e.stopPropagation(); onConfigure(); }}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors cursor-pointer"
              >
                <Settings className="size-3.5" />
              </button>
            )}
          </div>
          <div className="relative flex items-end gap-3 px-4 -mt-8">
            <AgentIcon
              agentId={agentId}
              name={resolvedName}
              avatarUrl={agent?.avatarUrl}
              icon={agent?.icon}
              apiBase={agent?.apiBase}
              modelId={agent?.modelId}
              providerId={agent?.providerId}
              modelProvider={agent?.modelProvider}
              className="shrink-0 size-12 rounded-xl border-2 border-background shadow-sm"
            />
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-baseline gap-1.5">
                <p className="font-semibold truncate text-[15px]">{resolvedName}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{agent?.role || agentId}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap mt-1">
                {badges.map((b) => (
                  <span
                    key={b.label}
                    className={`inline-flex items-center rounded-full border border-border/40 bg-background px-1.5 py-px text-[10px] leading-tight text-muted-foreground ${b.variant === 'mono' ? 'font-mono' : ''}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {compact && (
        <div className="flex items-center gap-3">
          <AgentIcon
            agentId={agentId}
            name={resolvedName}
            avatarUrl={agent?.avatarUrl}
            icon={agent?.icon}
            apiBase={agent?.apiBase}
            modelId={agent?.modelId}
            providerId={agent?.providerId}
            modelProvider={agent?.modelProvider}
            className="shrink-0 size-8 rounded-full"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p className="font-medium truncate text-sm">{resolvedName}</p>
              <span className="shrink-0 text-[11px] text-muted-foreground">{agent?.role || agentId}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {badges.map((b) => (
                <span
                  key={b.label}
                  className={`inline-flex items-center rounded-full bg-muted px-1.5 py-px text-[10px] leading-tight ${b.variant === 'mono' ? 'font-mono' : ''}`}
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>
          {agent && onConfigure && (
            <button
              onClick={(e) => { e.stopPropagation(); onConfigure(); }}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Settings className="size-4" />
            </button>
          )}
        </div>
      )}
      {agent && <div className={!compact ? 'px-4' : ''}><AgentDetails agent={agent} /></div>}
      {!compact && channels.length > 0 && (
        <div className="space-y-1 px-4 pt-1">
          <p className="text-xs font-medium text-muted-foreground">{t('channels')}</p>
          <div className="flex flex-wrap gap-1.5">
            {channels.map((ch) => (
              <span key={ch} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                <MessageSquare className="size-3" />{ch}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function UserInfoCard({ compact = false }: { compact?: boolean }) {
  const _userAvatar = useUserAvatar();
  const t = useTranslations('chat.memberInfoCard');
  return (
    <div className="flex items-center gap-3">
      <AgentIcon name="User" avatarUrl={_userAvatar || undefined} className={compact ? 'size-8 rounded-full' : 'size-10 rounded-full'} />
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>{t('user')}</p>
        <span className="text-xs text-muted-foreground">{t('member')}</span>
      </div>
    </div>
  );
}

export { RUNTIME_LABELS, PROVIDER_LABELS };
