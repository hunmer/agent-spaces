import { createHash } from 'node:crypto';
import type { LLMModel, LLMProvider } from '@agent-spaces/shared';
import * as llmStore from '../storage/llm-store.js';

export const INDEX_BATCH_SIZE = 16;
export const MAX_INDEX_TEXT_LENGTH = 24_000;

export interface EmbeddingDebug {
  stage: string;
  providerName?: string;
  modelId?: string;
  requestUrl?: string;
  inputCount?: number;
  inputLengths?: number[];
  status?: number;
  responseContentType?: string | null;
  responseDataCount?: number;
  validEmbeddingCount?: number;
  embeddingDimensions?: number[];
  responseKeys?: string[];
  responsePreview?: unknown;
  batchStart?: number;
  batchSize?: number;
  indexedCount?: number;
}

export class EmbeddingError extends Error {
  debug: EmbeddingDebug;
  constructor(message: string, debug: EmbeddingDebug) {
    super(message);
    this.name = 'EmbeddingError';
    this.debug = debug;
  }
}

export interface EmbeddingModelConfig {
  model: LLMModel;
  provider: LLMProvider;
}

export function requireEmbeddingModelConfig(modelId: string): EmbeddingModelConfig {
  const model = llmStore.getModel(modelId);
  if (!model) throw new Error(`Embedding model not found: ${modelId}`);
  if (!model.embedding) throw new Error(`Selected model is not marked as an embedding model: ${model.name}`);
  const provider = llmStore.listProviders().find((item) => item.name === model.provider);
  if (!provider) throw new Error(`Provider not found for embedding model: ${model.provider}`);
  if (!provider.apiBase || !provider.apiKey || !model.modelId) {
    throw new Error(`Embedding provider is missing apiBase, apiKey, or modelId: ${provider.name}`);
  }
  return { model, provider };
}

export function getEmbeddingsUrl(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, '');
  if (base.endsWith('/embeddings')) return base;
  return `${base}/embeddings`;
}

export async function embedTexts(
  config: EmbeddingModelConfig,
  input: string[],
  extraDebug: Partial<EmbeddingDebug> = {},
): Promise<number[][]> {
  const requestUrl = getEmbeddingsUrl(config.provider.apiBase);
  const requestDebug: EmbeddingDebug = {
    stage: 'embedding_request',
    providerName: config.provider.name,
    modelId: config.model.modelId,
    requestUrl,
    inputCount: input.length,
    inputLengths: input.map((item) => item.length),
    ...extraDebug,
  };
  console.info('[embedding:embed] request', requestDebug);

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.model.modelId, input }),
  });

  const responseText = await response.text();
  const responseDebugBase: EmbeddingDebug = {
    ...requestDebug,
    stage: 'embedding_response',
    status: response.status,
    responseContentType: response.headers.get('content-type'),
  };

  if (!response.ok) {
    const debug = { ...responseDebugBase, responsePreview: responseText.slice(0, 1000) };
    console.warn('[embedding:embed] failed response', debug);
    throw new EmbeddingError(`Embedding request failed with status ${response.status}`, debug);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    const debug = { ...responseDebugBase, stage: 'embedding_parse_json', responsePreview: responseText.slice(0, 1000) };
    console.warn('[embedding:embed] invalid json', debug);
    throw new EmbeddingError('Embedding response is not valid JSON.', debug);
  }

  const responseData = isRecord(data) && Array.isArray(data.data) ? data.data : undefined;
  const embeddings = responseData
    ?.map((item) => (isRecord(item) ? item.embedding : undefined))
    .filter((item): item is number[] => Array.isArray(item) && item.every((value) => typeof value === 'number'));
  const debug: EmbeddingDebug = {
    ...responseDebugBase,
    responseDataCount: responseData?.length,
    validEmbeddingCount: embeddings?.length ?? 0,
    embeddingDimensions: embeddings?.map((e) => e.length).slice(0, 10),
    responseKeys: isRecord(data) ? Object.keys(data) : undefined,
    responsePreview: previewEmbeddingResponse(data),
  };
  console.info('[embedding:embed] parsed response', debug);

  if (!embeddings || embeddings.length !== input.length) {
    throw new EmbeddingError(
      `Embedding response does not match input length. expected=${input.length}, data=${responseData?.length ?? 0}, validEmbeddings=${embeddings?.length ?? 0}`,
      debug,
    );
  }
  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let ma = 0;
  let mb = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    ma += a[index] * a[index];
    mb += b[index] * b[index];
  }
  if (!ma || !mb) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function normalizeIndexText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_INDEX_TEXT_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function previewEmbeddingResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const data = Array.isArray(value.data)
    ? value.data.slice(0, 3).map((item) => {
        if (!isRecord(item)) return item;
        const embedding = Array.isArray(item.embedding) ? item.embedding : undefined;
        return { ...item, embedding: embedding ? `[number[${embedding.length}]]` : item.embedding };
      })
    : value.data;
  return { ...value, data };
}
