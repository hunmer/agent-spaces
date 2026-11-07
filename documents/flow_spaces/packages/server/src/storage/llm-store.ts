import { join } from 'node:path';
import type { LLMModel, LLMProvider } from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js';
import { v4 as uuid } from 'uuid';

function llmDir() {
  return join(getDataDir(), 'llm');
}

function modelsFile() {
  return join(llmDir(), 'models.json');
}

function providersFile() {
  return join(llmDir(), 'providers.json');
}

// --- Models ---

export function listModels(): LLMModel[] {
  return readJsonFile<LLMModel[]>(modelsFile()) || [];
}

export function getModel(id: string): LLMModel | undefined {
  return listModels().find(m => m.id === id);
}

export function createModel(model: Omit<LLMModel, 'id'>): LLMModel {
  const newModel: LLMModel = { ...model, id: uuid() };
  const models = listModels();
  models.push(newModel);
  writeJsonFile(modelsFile(), models);
  return newModel;
}

export function updateModel(id: string, data: Partial<LLMModel>): LLMModel | null {
  const models = listModels();
  const idx = models.findIndex(m => m.id === id);
  if (idx < 0) return null;
  models[idx] = { ...models[idx], ...data, id };
  writeJsonFile(modelsFile(), models);
  return models[idx];
}

export function deleteModel(id: string): boolean {
  const models = listModels();
  const filtered = models.filter(m => m.id !== id);
  if (filtered.length === models.length) return false;
  writeJsonFile(modelsFile(), filtered);
  return true;
}

// --- Providers ---

export function listProviders(): LLMProvider[] {
  return readJsonFile<LLMProvider[]>(providersFile()) || [];
}

export function getProvider(id: string): LLMProvider | undefined {
  return listProviders().find(p => p.id === id);
}

export function createProvider(provider: Omit<LLMProvider, 'id' | 'createdAt' | 'updatedAt'>): LLMProvider {
  const now = new Date().toISOString();
  const newProvider: LLMProvider = { ...provider, id: uuid(), createdAt: now, updatedAt: now };
  const providers = listProviders();
  providers.push(newProvider);
  ensureDir(llmDir());
  writeJsonFile(providersFile(), providers);
  return newProvider;
}

export function updateProvider(id: string, data: Partial<LLMProvider>): LLMProvider | null {
  const providers = listProviders();
  const idx = providers.findIndex(p => p.id === id);
  if (idx < 0) return null;
  providers[idx] = { ...providers[idx], ...data, id, updatedAt: new Date().toISOString() };
  ensureDir(llmDir());
  writeJsonFile(providersFile(), providers);
  return providers[idx];
}

export function deleteProvider(id: string): boolean {
  const providers = listProviders();
  const filtered = providers.filter(p => p.id !== id);
  if (filtered.length === providers.length) return false;
  ensureDir(llmDir());
  writeJsonFile(providersFile(), filtered);
  return true;
}
