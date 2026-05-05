import { Router } from 'express';
import * as store from '../storage/llm-store.js';

const router = Router();

// Models
router.get('/models', (_req, res) => {
  res.json(store.listModels());
});

router.post('/models', (req, res) => {
  const { modelId, name, provider, vision, reasoning, embedding, cost } = req.body;
  if (!modelId || !name || !provider) {
    res.status(400).json({ error: 'modelId, name, and provider are required' });
    return;
  }
  const model = store.createModel({
    modelId,
    name,
    provider,
    cost: normalizeModelCost(cost),
    vision: Boolean(vision),
    reasoning: Boolean(reasoning),
    embedding: Boolean(embedding),
  });
  res.status(201).json(model);
});

router.put('/models/:id', (req, res) => {
  const body = {
    ...req.body,
  };
  if ('cost' in body) body.cost = normalizeModelCost(body.cost);
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

// Providers
router.get('/providers', (_req, res) => {
  res.json(store.listProviders());
});

router.post('/providers', (req, res) => {
  const { name, apiBase, apiKey } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const provider = store.createProvider({
    name,
    apiBase: apiBase || '',
    apiKey: apiKey || '',
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
