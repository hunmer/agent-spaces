import type { AgentConfig } from "@agent-spaces/shared";

export const BASE_MODEL_CAPABILITIES = ["vision", "reasoning", "embedding"] as const;
export const OPENAI_RESPONSES_MODEL_CAPABILITIES = [...BASE_MODEL_CAPABILITIES, "image"] as const;

export type ModelCapability = typeof OPENAI_RESPONSES_MODEL_CAPABILITIES[number];

export const CAP_CLS: Record<ModelCapability, string> = {
  vision: "bg-blue-500/10 text-blue-600 border-blue-200",
  reasoning: "bg-purple-500/10 text-purple-600 border-purple-200",
  embedding: "bg-green-500/10 text-green-600 border-green-200",
  image: "bg-amber-500/10 text-amber-600 border-amber-200",
};

export function isOpenAIResponsesModelProvider(
  modelProvider?: AgentConfig["modelProvider"] | string | null,
): boolean {
  return modelProvider === "openai-responses";
}

export function getModelCapabilities(
  modelProvider?: AgentConfig["modelProvider"] | string | null,
): readonly ModelCapability[] {
  return isOpenAIResponsesModelProvider(modelProvider)
    ? OPENAI_RESPONSES_MODEL_CAPABILITIES
    : BASE_MODEL_CAPABILITIES;
}

export function supportsCatalogImageCapability(
  modelProvider?: AgentConfig["modelProvider"] | string | null,
  outputModalities?: readonly string[] | null,
): boolean {
  return isOpenAIResponsesModelProvider(modelProvider) && (outputModalities?.includes("image") ?? false);
}
