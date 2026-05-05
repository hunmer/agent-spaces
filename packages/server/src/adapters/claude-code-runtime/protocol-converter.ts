import type {
  AnthropicRequest,
  AnthropicBlock,
  OpenAIChatRequest,
  ResponsesBody,
  OpenAIChatBody,
} from './types.js';

export function convertAnthropicToOpenAI(
  request: AnthropicRequest,
  model: string,
  options: { thinkingEnabled?: boolean; thinkingEffort?: 'low' | 'medium' | 'high' } = {},
): OpenAIChatRequest {
  const messages: Array<Record<string, unknown>> = [];
  const system = normalizeSystemPrompt(request.system);
  if (system) messages.push({ role: 'system', content: system });

  for (const message of request.messages) {
    messages.push(...convertAnthropicMessage(message));
  }

  return compactObject({
    model,
    messages,
    max_tokens: request.max_tokens === 1 ? 32 : request.max_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    stop: request.stop_sequences,
    reasoning: options.thinkingEnabled === false
      ? undefined
      : { effort: options.thinkingEffort ?? 'medium' },
    tools: request.tools?.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    })),
    tool_choice: convertOpenAIToolChoice(request.tool_choice),
  });
}

export function convertAnthropicMessage(message: AnthropicRequest['messages'][number]): Array<Record<string, unknown>> {
  if (typeof message.content === 'string') {
    if (message.role === 'assistant' && isAssistantPrefill(message.content)) return [];
    return [{ role: message.role, content: message.content }];
  }

  if (message.role === 'user') {
    const output: Array<Record<string, unknown>> = [];
    const textParts: string[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
        continue;
      }
      if (block.type === 'tool_result') {
        output.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: stringifyToolResult(block),
        });
      }
    }
    if (textParts.length > 0) {
      output.push({ role: 'user', content: textParts.join('\n') });
    }
    return output;
  }

  const textParts: string[] = [];
  const toolCalls: Array<Record<string, unknown>> = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
      continue;
    }
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }
  const content = textParts.join('\n');
  if (toolCalls.length === 0 && isAssistantPrefill(content)) return [];
  return [{
    role: 'assistant',
    content: content || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  }];
}

export function convertOpenAIChatRequestToResponses(chatRequest: OpenAIChatRequest): Record<string, unknown> {
  const messages = chatRequest.messages;
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => stringifyContent(message.content))
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => (message as Record<string, unknown>).role !== 'system')
    .flatMap(convertChatMessageToResponseInput);
  return compactObject({
    model: chatRequest.model,
    input,
    instructions: instructions || undefined,
    max_output_tokens: chatRequest.max_tokens,
    temperature: chatRequest.temperature,
    top_p: chatRequest.top_p,
    stop: chatRequest.stop,
    reasoning: chatRequest.reasoning,
    tools: chatRequest.tools?.map((tool: { function: { name: string; description?: string; parameters?: unknown } }) => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: false,
    })),
    tool_choice: convertResponsesToolChoice(chatRequest.tool_choice),
  });
}

export function convertResponsesToAnthropic(response: ResponsesBody, originalModel: string): Record<string, unknown> {
  const content = extractResponsesContent(response);
  const hasToolUse = content.some((block) => block.type === 'tool_use');
  return {
    id: `msg_${response.id ?? Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    content: content.length ? content : [{ type: 'text', text: '' }],
    model: originalModel,
    stop_reason: hasToolUse ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_input_tokens: response.usage?.input_tokens_details?.cached_tokens,
      reasoning_output_tokens: response.usage?.output_tokens_details?.reasoning_tokens,
    },
  };
}

export function convertChatCompletionsToAnthropic(response: OpenAIChatBody, originalModel: string): Record<string, unknown> {
  const choice = response.choices?.[0];
  const message = choice?.message;
  const content: AnthropicBlock[] = [];
  if (message?.content) {
    content.push({ type: 'text', text: message.content });
  }
  for (const toolCall of message?.tool_calls ?? []) {
    content.push({
      type: 'tool_use',
      id: String(toolCall.id ?? `call_${Date.now().toString(36)}`),
      name: String(toolCall.function?.name ?? ''),
      input: parseJsonObject(String(toolCall.function?.arguments ?? '{}')),
    });
  }

  return {
    id: `msg_${response.id ?? Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    content: content.length ? content : [{ type: 'text', text: '' }],
    model: originalModel,
    stop_reason: mapOpenAIStopReason(choice?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: response.usage?.prompt_tokens_details?.cached_tokens,
      reasoning_output_tokens: response.usage?.completion_tokens_details?.reasoning_tokens,
    },
  };
}

function normalizeSystemPrompt(system?: AnthropicRequest['system']): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system
    .map((item) => typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n');
}

function stringifyToolResult(block: Extract<AnthropicBlock, { type: 'tool_result' }>): string {
  const content = typeof block.content === 'string'
    ? block.content
    : block.content
      .map((item) => item.type === 'text' ? item.text : JSON.stringify(item))
      .join('\n');
  return block.is_error ? `Error: ${content}` : content;
}

function convertOpenAIToolChoice(toolChoice?: AnthropicRequest['tool_choice']): unknown {
  if (!toolChoice) return undefined;
  if (toolChoice.type === 'auto') return 'auto';
  if (toolChoice.type === 'any') return 'required';
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  return undefined;
}

function isAssistantPrefill(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return ['{', '[', '```', '{"', '[{', '<', '<tool_code', '<tool_code>'].includes(trimmed)
    || trimmed.length <= 2
    || (trimmed.startsWith('<tool_code') && !trimmed.includes('</tool_code>'));
}

function convertChatMessageToResponseInput(rawMessage: unknown): Record<string, unknown>[] {
  const message = rawMessage as Record<string, unknown>;
  const role = message.role;
  if (role === 'tool') {
    return [{
      type: 'function_call_output',
      call_id: String(message.tool_call_id ?? ''),
      output: String(message.content ?? ''),
    }];
  }
  if (role === 'assistant' && Array.isArray(message.tool_calls)) {
    const items: Record<string, unknown>[] = [];
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (content) items.push(createResponseMessage('assistant', content));
    for (const toolCall of message.tool_calls as Array<Record<string, unknown>>) {
      const fn = toolCall.function as Record<string, unknown> | undefined;
      items.push({
        type: 'function_call',
        call_id: String(toolCall.id ?? ''),
        name: String(fn?.name ?? ''),
        arguments: String(fn?.arguments ?? '{}'),
      });
    }
    return items;
  }
  if (role === 'system') return [createResponseMessage('system', stringifyContent(message.content))];
  if (role === 'assistant') return [createResponseMessage('assistant', stringifyContent(message.content))];
  return [createResponseMessage('user', stringifyContent(message.content))];
}

function createResponseMessage(role: string, text: string): Record<string, unknown> {
  return {
    type: 'message',
    role,
    content: text,
  };
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (!part || typeof part !== 'object') return '';
    const record = part as Record<string, unknown>;
    return typeof record.text === 'string' ? record.text : JSON.stringify(record);
  }).filter(Boolean).join('\n');
}

function convertResponsesToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || toolChoice === 'auto' || toolChoice === 'none' || toolChoice === 'required') return toolChoice;
  if (typeof toolChoice !== 'object') return undefined;
  const fn = (toolChoice as { function?: { name?: string } }).function;
  return fn?.name ? { type: 'function', name: fn.name } : undefined;
}

function extractResponsesContent(response: ResponsesBody): AnthropicBlock[] {
  const blocks: AnthropicBlock[] = [];
  if (response.output_text) blocks.push({ type: 'text', text: response.output_text });

  for (const item of response.output ?? []) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      const text = item.content.map((part) => {
        if (!part || typeof part !== 'object') return '';
        const record = part as Record<string, unknown>;
        return typeof record.text === 'string' ? record.text : '';
      }).filter(Boolean).join('');
      if (text && !blocks.some((block) => block.type === 'text' && block.text === text)) {
        blocks.push({ type: 'text', text });
      }
      continue;
    }
    if (item.type === 'reasoning') {
      const thinking = extractReasoningText(item);
      if (thinking) blocks.push({ type: 'thinking', thinking });
      continue;
    }
    if (item.type === 'function_call') {
      blocks.push({
        type: 'tool_use',
        id: String(item.call_id ?? item.id ?? `call_${Date.now().toString(36)}`),
        name: String(item.name ?? ''),
        input: parseJsonObject(String(item.arguments ?? '{}')),
      });
    }
  }

  return blocks;
}

function extractReasoningText(item: Record<string, unknown>): string {
  if (typeof item.summary === 'string') return item.summary;
  if (Array.isArray(item.summary)) {
    return item.summary.map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      return typeof record.text === 'string' ? record.text : '';
    }).filter(Boolean).join('\n');
  }
  if (typeof item.text === 'string') return item.text;
  if (typeof item.content === 'string') return item.content;
  return '';
}

function mapOpenAIStopReason(finishReason?: string | null): string {
  if (finishReason === 'length') return 'max_tokens';
  if (finishReason === 'tool_calls') return 'tool_use';
  return 'end_turn';
}

export function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
