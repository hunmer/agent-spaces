'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent';

const APIBASE_ICON_MAP: Array<[RegExp, string]> = [
  // Google
  [/generativelanguage\.googleapis\.com/i, 'gemini'],
  [/aiplatform\.googleapis\.com/i, 'google'],
  // Anthropic
  [/api\.anthropic\.com/i, 'anthropic'],
  // OpenAI
  [/api\.openai\.com/i, 'openai'],
  // DeepSeek
  [/api\.deepseek\.com/i, 'deepseek'],
  // Zhipu / 智谱
  [/open\.bigmodel\.cn/i, 'zhipu'],
  // Moonshot / Kimi
  [/api\.moonshot\.cn/i, 'kimi'],
  // Alibaba / Qwen
  [/dashscope\.aliyuncs\.com/i, 'alibaba'],
  [/dashscope\.com/i, 'alibaba'],
  // Baidu / Wenxin
  [/aip\.baidubce\.com/i, 'baidu'],
  // ByteDance / Doubao
  [/ark\.cn-beijing\.volces\.com/i, 'doubao'],
  [/api\.coze\./i, 'doubao'],
  // MiniMax
  [/api\.minimax\.chat/i, 'minimax'],
  [/api\.minimaxi\.com/i, 'minimax'],
  // Mistral
  [/api\.mistral\.ai/i, 'mistral'],
  // Groq
  [/api\.groq\.com/i, 'xai'],
  // xAI
  [/api\.x\.ai/i, 'xai'],
  // OpenRouter
  [/openrouter\.ai/i, 'openrouter'],
  // SiliconFlow
  [/api\.siliconflow\.cn/i, 'siliconflow'],
  // Ollama
  [/localhost.*11434/i, 'ollama'],
  [/127\.0\.0\.1.*11434/i, 'ollama'],
  // Cohere
  [/api\.cohere\./i, 'cohere'],
  // HuggingFace
  [/api-inference\.huggingface\.co/i, 'huggingface'],
  // Azure
  [/openai\.azure\.com/i, 'azure'],
  [/\.openai\.azure\.com/i, 'azure'],
  // AWS Bedrock
  [/bedrock-runtime\..*\.amazonaws\.com/i, 'aws'],
  // Huawei
  [/api\.huawei\./i, 'huawei'],
  // Tencent / Hunyuan
  [/hunyuan\.tencentcloudapi\.com/i, 'tencent'],
  // Yi
  [/api\.01\.ai/i, 'yi'],
  // StepFun
  [/api\.stepfun\.com/i, 'stepfun'],
  // Novita
  [/api\.novita\.ai/i, 'novita'],
  // NVIDIA
  [/integrate\.api\.nvidia\.com/i, 'nvidia'],
  // Cloudflare Workers AI
  [/api\.cloudflare\.com\/client\/v4\/accounts/i, 'cloudflare'],
  // Meta
  [/meta\.llama/i, 'meta'],
];

function resolveIconName(apiBase?: string): string {
  if (!apiBase) return '';
  for (const [pattern, icon] of APIBASE_ICON_MAP) {
    if (pattern.test(apiBase)) return icon;
  }
  return '';
}

export function getProviderIconUrl(apiBase?: string): string {
  const iconName = resolveIconName(apiBase);
  return iconName ? `/static/provider-icons/${iconName}.svg` : '';
}

export interface AgentIconProps {
  agentId?: string;
  name?: string;
  avatarUrl?: string;
  apiBase?: string;
  className?: string;
  onClick?: () => void;
}

export function AgentIcon({ agentId, name, avatarUrl, apiBase, className, onClick }: AgentIconProps) {
  const agents = useAgentStore((s) => s.agents);
  const [imgError, setImgError] = useState(false);

  const agent = agentId ? agents.find((a) => a.id === agentId) : undefined;
  const displayName = name || agent?.name || agentId || '?';
  const resolvedAvatarUrl = avatarUrl ?? agent?.avatarUrl;
  const resolvedApiBase = apiBase ?? agent?.apiBase;
  const src = resolvedAvatarUrl || (!imgError ? getProviderIconUrl(resolvedApiBase) : '');

  useEffect(() => {
    setImgError(false);
  }, [resolvedAvatarUrl, resolvedApiBase]);
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-lg bg-muted shrink-0',
        src && 'bg-transparent',
        !onClick && 'pointer-events-none',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className,
      )}
    >
      {src ? (
        <img src={src} alt={displayName} className="size-full object-cover rounded-[inherit]" onError={() => setImgError(true)} />
      ) : (
        <span className="text-xs font-semibold select-none">{initial}</span>
      )}
    </div>
  );
}
