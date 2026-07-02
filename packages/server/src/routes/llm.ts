import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentConfig } from '@agent-spaces/shared';
import * as store from '../storage/llm-store.js';
import { getCatalog, resolveAgentIcon } from '../storage/model-catalog-store.js';
import type { Catalog, CatalogModel } from '../storage/model-catalog-store.js';

const router = Router();

// Models
router.get('/models', (_req, res) => {
  res.json(store.listModels());
});

router.post('/models', async (req, res) => {
  const {
    modelId,
    name,
    provider,
    vision,
    reasoning,
    embedding,
    cost,
    maxContextTokens,
    thinkingEnabled,
    thinkingEffort,
    autoFill,
  } = req.body;
  if (!modelId || !provider) {
    res.status(400).json({ error: 'modelId and provider are required' });
    return;
  }
  // modelId 支持逗号拆分，单次添加多个模型
  const modelIds = String(modelId)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (modelIds.length === 0) {
    res.status(400).json({ error: 'modelId is required' });
    return;
  }
  const names = String(name ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const shouldAutoFill = autoFill === true;
  const catalog = shouldAutoFill ? await getCatalog() : null;
  const created = modelIds.map((mid, i) => {
    const base: {
      provider: string;
      cost?: { inputPerMillion: number; outputPerMillion: number };
      maxContextTokens?: number;
      thinkingEnabled?: boolean;
      thinkingEffort?: 'low' | 'medium' | 'high';
      vision?: boolean;
      reasoning?: boolean;
      embedding?: boolean;
    } = {
      provider,
      vision: typeof vision === 'boolean' ? vision : undefined,
      reasoning: typeof reasoning === 'boolean' ? reasoning : undefined,
      embedding: typeof embedding === 'boolean' ? embedding : undefined,
      maxContextTokens: normalizeTokenLimit(maxContextTokens),
      thinkingEnabled: typeof thinkingEnabled === 'boolean' ? thinkingEnabled : undefined,
      thinkingEffort: normalizeThinkingEffort(thinkingEffort),
    };
    const normalizedCost = normalizeModelCost(cost);
    // 用户显式传了非零 cost 才采用，否则留给 autoFill/默认
    if (normalizedCost.inputPerMillion > 0 || normalizedCost.outputPerMillion > 0) {
      base.cost = normalizedCost;
    }
    const filled = catalog ? applyCatalogDefaults(catalog, {
      modelId: mid,
      name: names[i] || mid,
      ...base,
    }, true) : { modelId: mid, name: names[i] || mid, ...base };
    return store.createModel({
      modelId: mid,
      name: names[i] || mid,
      provider,
      cost: filled.cost ?? { inputPerMillion: 0, outputPerMillion: 0 },
      maxContextTokens: filled.maxContextTokens,
      thinkingEnabled: filled.thinkingEnabled ?? false,
      thinkingEffort: filled.thinkingEffort ?? 'medium',
      vision: filled.vision ?? false,
      reasoning: filled.reasoning ?? false,
      embedding: filled.embedding ?? false,
    });
  });
  res.status(201).json(created.length === 1 ? created[0] : created);
});

router.put('/models/:id', (req, res) => {
  const body = {
    ...req.body,
  };
  if ('cost' in body) body.cost = normalizeModelCost(body.cost);
  if ('maxContextTokens' in body) body.maxContextTokens = normalizeTokenLimit(body.maxContextTokens);
  if ('thinkingEnabled' in body) body.thinkingEnabled = normalizeThinkingEnabled(body.thinkingEnabled);
  if ('thinkingEffort' in body) body.thinkingEffort = normalizeThinkingEffort(body.thinkingEffort);
  const model = store.updateModel(req.params.id, body);
  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }
  res.json(model);
});

router.delete('/models/:id', (req, res) => {
  if (!store.deleteModel(req.params.id)) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }
  res.status(204).end();
});

// 同步模型价格：读取 catalog.json 中各模型的 cost，更新到本地模型列表
router.post('/models/sync-prices', async (_req, res) => {
  try {
    const catalog = await getCatalog();
    const result = syncModelPricesFromCatalog(catalog);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to sync model prices' });
  }
});

// Providers
router.get('/providers', (_req, res) => {
  res.json(store.listProviders());
});

router.post('/providers', (req, res) => {
  const { name, apiBase, apiKey, modelProvider } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const provider = store.createProvider({
    name,
    apiBase: apiBase || '',
    apiKey: apiKey || '',
    modelProvider: modelProvider || undefined,
  });
  res.status(201).json(provider);
});

router.put('/providers/:id', (req, res) => {
  const provider = store.updateProvider(req.params.id, req.body);
  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }
  res.json(provider);
});

router.delete('/providers/:id', (req, res) => {
  if (!store.deleteProvider(req.params.id)) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }
  res.status(204).end();
});

async function handleResolveAgentIcon(req: Request, res: Response) {
  try {
    const input = req.body as Partial<AgentConfig>;
    const provider = input.providerId ? store.getProvider(input.providerId) : undefined;
    const configuredModel = input.modelId
      ? store.listModels().find((model) => model.modelId === input.modelId || model.name === input.modelId)
      : undefined;
    const configuredProvider = configuredModel
      ? store.listProviders().find((item) => item.id === configuredModel.provider || item.name === configuredModel.provider)
      : undefined;
    const catalog = await getCatalog();
    const icon = resolveAgentIcon(catalog, {
      avatarUrl: input.avatarUrl,
      icon: input.icon,
      apiBase: input.apiBase || provider?.apiBase || configuredProvider?.apiBase,
      modelId: input.modelId,
      providerName: configuredProvider?.name || configuredModel?.provider,
    });
    res.json(icon);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to resolve agent icon' });
  }
}

router.post('/providers/agent-icon', handleResolveAgentIcon);

export default router;

function normalizeModelCost(cost: unknown) {
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) {
    return { inputPerMillion: 0, outputPerMillion: 0 };
  }
  const data = cost as Record<string, unknown>;
  return {
    inputPerMillion: toNonNegativeNumber(data.inputPerMillion),
    outputPerMillion: toNonNegativeNumber(data.outputPerMillion),
  };
}

function toNonNegativeNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeTokenLimit(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.floor(number);
}

function normalizeThinkingEnabled(value: unknown): boolean {
  return value === undefined ? true : Boolean(value);
}

function normalizeThinkingEffort(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'high' ? value : 'medium';
}

// 从 catalog 中查找模型的 cost（优先在 providers.models 查找，其次顶层 models）
function findCatalogModelCost(catalog: Catalog, modelId: string): { input?: number; output?: number } | null {
  for (const pid of Object.keys(catalog.providers)) {
    const m = catalog.providers[pid]?.models?.[modelId];
    if (m?.cost) return m.cost;
  }
  const top = catalog.models[modelId];
  return top?.cost ?? null;
}

function hasModelCost(cost: { input?: number; output?: number } | null): cost is { input: number; output: number } {
  return !!cost && typeof cost.input === 'number' && typeof cost.output === 'number';
}

// 从 catalog 查找完整模型信息（含 limit/modalities/reasoning）
function findCatalogModel(catalog: Catalog, modelId: string): CatalogModel | null {
  for (const pid of Object.keys(catalog.providers)) {
    const m = catalog.providers[pid]?.models?.[modelId];
    if (m) return m;
  }
  return catalog.models[modelId] ?? null;
}

// 从 catalog 自动填充模型属性（cost/context/vision/reasoning/thinking），未传字段才回填
function applyCatalogDefaults(catalog: Catalog, data: {
  modelId: string;
  name: string;
  cost?: { inputPerMillion: number; outputPerMillion: number };
  maxContextTokens?: number;
  vision?: boolean;
  reasoning?: boolean;
  embedding?: boolean;
  thinkingEnabled?: boolean;
  thinkingEffort?: 'low' | 'medium' | 'high';
}, autoFill: boolean) {
  if (!autoFill) return data;
  const cm = findCatalogModel(catalog, data.modelId);
  if (!cm) return data;
  const result = { ...data };
  // 价格：catalog 有有效 cost 时回填
  if (hasModelCost(cm.cost ?? null) && !result.cost) {
    result.cost = { inputPerMillion: cm.cost!.input!, outputPerMillion: cm.cost!.output! };
  }
  // 上下文
  if (typeof cm.limit?.context === 'number' && cm.limit.context > 0 && result.maxContextTokens === undefined) {
    result.maxContextTokens = cm.limit.context;
  }
  // 能力
  const inputs = cm.modalities?.input ?? [];
  if (result.vision === undefined) result.vision = cm.attachment === true || inputs.includes('image');
  if (result.reasoning === undefined) result.reasoning = cm.reasoning === true;
  // thinking 跟随 reasoning
  if (result.thinkingEnabled === undefined && result.reasoning !== undefined) {
    result.thinkingEnabled = result.reasoning;
  }
  return result;
}

interface SyncResult {
  total: number;
  updated: number;
  skipped: number;
  details: Array<{ id: string; name: string; modelId: string; from: { input: number; output: number }; to: { input: number; output: number } }>;
}

// 遍历本地模型，匹配 catalog 的 modelId，更新价格并保存
function syncModelPricesFromCatalog(catalog: Catalog): SyncResult {
  const models = store.listModels();
  const details: SyncResult['details'] = [];
  let updated = 0;
  let skipped = 0;

  for (const model of models) {
    const cost = findCatalogModelCost(catalog, model.modelId);
    if (!hasModelCost(cost)) {
      skipped++;
      continue;
    }
    const prevInput = model.cost?.inputPerMillion ?? 0;
    const prevOutput = model.cost?.outputPerMillion ?? 0;
    // 价格未变化则跳过
    if (prevInput === cost.input && prevOutput === cost.output) {
      skipped++;
      continue;
    }
    store.updateModel(model.id, {
      cost: { inputPerMillion: cost.input, outputPerMillion: cost.output },
    });
    details.push({
      id: model.id,
      name: model.name,
      modelId: model.modelId,
      from: { input: prevInput, output: prevOutput },
      to: { input: cost.input, output: cost.output },
    });
    updated++;
  }

  return { total: models.length, updated, skipped, details };
}
