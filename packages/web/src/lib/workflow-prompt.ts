import { useLLMStore } from '@/stores/llm';

/**
 * 构造让 agent 自动生成多 agent 协作 workflow 的提示词。
 *
 * 与 issue 创建流程共享同一份逻辑，保证从「issue 新建工作流」
 * 与「workflows 页面智能创建」入口生成的提示词完全一致。
 */
export function buildWorkflowPrompt(opts: {
  /** workflow 的描述（注释），可为空 */
  workflowDescription?: string;
  /** 对应的 issue/需求文本（标题或描述），可为空 */
  issuePrompt?: string;
}): string {
  const { workflowDescription = '', issuePrompt = '' } = opts;
  const { models, providers } = useLLMStore.getState();

  // 关联供应商，得到每个模型可直接写入 agent_run 节点配置的字段（providerId/modelId/modelProvider）
  const providerByName = new Map(providers.map((p) => [p.name, p]));
  const modelOptions = models
    .map((m) => {
      const provider = providerByName.get(m.provider);
      if (!provider) return null;
      const tags: string[] = [];
      if (m.reasoning) tags.push('推理');
      if (m.vision) tags.push('视觉');
      if (m.embedding) tags.push('向量');
      if (m.thinkingEnabled) tags.push(`思考(${m.thinkingEffort})`);
      const costInfo = m.cost ? `输入${m.cost.inputPerMillion}/输出${m.cost.outputPerMillion} 每百万tokens` : '价格未知';
      const ctx = m.maxContextTokens ? `上下文${m.maxContextTokens}tokens` : '上下文未知';
      return {
        name: m.name,
        modelId: m.modelId,
        providerId: provider.id,
        modelProvider: provider.modelProvider ?? '',
        tags,
        costInfo,
        ctx,
      };
    })
    .filter(Boolean) as Array<{
      name: string;
      modelId: string;
      providerId: string;
      modelProvider: string;
      tags: string[];
      costInfo: string;
      ctx: string;
    }>;

  // 按能力粗分档：具备推理或高强度思考的归为核心/复杂任务模型，其余为常规/轻量任务模型
  const heavy = modelOptions.filter((m) => m.tags.includes('推理') || m.tags.some((t) => t.startsWith('思考(high')));
  const light = modelOptions.filter((m) => !heavy.includes(m));

  const modelSection = modelOptions.length
    ? [
        '当前服务端可用的供应商与模型（每个模型均给出可直接写入 agent_run 节点配置的字段）：',
        ...modelOptions.map(
          (m) =>
            `- ${m.name}：providerId="${m.providerId}"，modelId="${m.modelId}"，modelProvider="${m.modelProvider}"；能力[${m.tags.join('/') || '无'}]；${m.ctx}；${m.costInfo}`,
        ),
        heavy.length ? `适合核心/复杂 agent 的模型：${heavy.map((m) => m.name).join('、')}` : '',
        light.length ? `适合常规/轻量 agent 的模型：${light.map((m) => m.name).join('、')}` : '',
        '请根据每个 agent 节点承担任务的难度，从上面的列表里挑合适的 providerId/modelId/modelProvider 写入对应 agent_run 节点配置。',
      ].filter(Boolean).join('\n')
    : '当前服务端未配置任何模型，请在产出中提示用户先在「模型设置」中添加供应商和模型。';

  return [
    '请创建一个以多 agent 协同合作为主的 workspace workflow。',
    '要求：优先拆分为多个 agent 节点协作；先调用 list_available_agent_capabilities 查询当前环境可用的 mcps/tools/skills 全量清单，再调用 list_agent_capabilities 查询当前可用 agent 及其已配置能力，最后根据每个 agent 的职责分配能力。把 channel/mcp/tool 理解为 agent 的协作与能力配置，不要把它们当成独立节点来创建。当前 workflow 会由已有 issue 启动，agent 只能使用 ViewCurrentChannelIssue 和 AddCurrentChannelComment 同步进度和结果，禁止配置或调用 CreateCurrentChannelIssue。',
    'agent 配置示例（写在 agent_run.data.agent 中，而不是新建 channel/mcp/tool 节点）：{"name":"Research Agent","role":"agent","providerId":"<from-model-list>","modelId":"<from-model-list>","modelProvider":"<from-model-list>","mcps":{"mcpServers":{"filesystem":{}}},"skills":["research"],"tools":["ViewCurrentChannelIssue","AddCurrentChannelComment","ReadWorkspaceFile","SearchWorkspaceFiles"],"systemPrompt":"先收集信息，再调用 AddCurrentChannelComment 把结论同步到当前 issue。不要创建新的 issue。"}',
    '编写后续 agent 的提示词时，必须明确引用上一个 agent 的输出结果变量，使用 {{xx}} 这种变量占位格式，并替换为实际可用的上游输出变量名。',
    workflowDescription ? `工作流注释：${workflowDescription}` : '',
    issuePrompt ? `Issue 需求：${issuePrompt}` : '',
    modelSection,
  ].filter(Boolean).join('\n');
}
