import { LanguageModelV2CallOptions } from "@ai-sdk/provider";
import Log from "../common/log";

/**
 * Adaptive retry strategy for LLM calls.
 * Adjusts parameters on failure to improve success rate.
 */

export type ModuleType = "planning" | "navigation" | "compression" | "default";

export interface RetryAdjustment {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
}

export interface AdaptiveRetryConfig {
  enabled: boolean;
  maxRetries: number;
  adjustments: RetryAdjustment[];
}

/**
 * Default retry configurations for each module type.
 * Each adjustment is applied progressively on each retry attempt.
 * SLOW ESCALATION: Parameters change gradually to give the model
 * multiple chances before making drastic changes.
 */
export const MODULE_RETRY_CONFIGS: Record<ModuleType, AdaptiveRetryConfig> = {
  planning: {
    enabled: true,
    maxRetries: 4,
    adjustments: [
      // First retry: very slight adjustment
      { temperature: -0.05 },
      // Second retry: reduce temperature more
      { temperature: -0.1, topP: -0.05 },
      // Third retry: further reduce, add tokens
      { temperature: -0.15, topP: -0.1, maxOutputTokens: 1024 },
      // Fourth retry: most conservative, maximum tokens
      { temperature: -0.2, topP: -0.15, maxOutputTokens: 2048 },
    ],
  },
  navigation: {
    enabled: true,
    maxRetries: 5,
    adjustments: [
      // First retry: minimal adjustment - give another chance
      { temperature: -0.03 },
      // Second retry: slightly more deterministic
      { temperature: -0.07, topK: -3 },
      // Third retry: make more deterministic
      { temperature: -0.1, topK: -5 },
      // Fourth retry: more conservative
      { temperature: -0.13, topK: -8, topP: -0.05 },
      // Fifth retry: very deterministic as last resort
      { temperature: -0.15, topK: -10, topP: -0.1 },
    ],
  },
  compression: {
    enabled: true,
    maxRetries: 3,
    adjustments: [
      // First retry: slight increase in tokens
      { maxOutputTokens: 512 },
      // Second retry: more tokens
      { maxOutputTokens: 1024 },
      // Third retry: maximum tokens with slight temp adjustment
      { maxOutputTokens: 2048, temperature: 0.1 },
    ],
  },
  default: {
    enabled: true,
    maxRetries: 3,
    adjustments: [
      // First retry: very slight adjustment
      { temperature: -0.03 },
      // Second retry: moderate adjustment
      { temperature: -0.07 },
      // Third retry: conservative
      { temperature: -0.1, maxOutputTokens: 1024 },
    ],
  },
};

/**
 * Apply retry adjustment to options
 */
export function applyRetryAdjustment(
  options: LanguageModelV2CallOptions,
  adjustment: RetryAdjustment,
  baseConfig?: { temperature?: number; topP?: number; topK?: number; maxOutputTokens?: number }
): LanguageModelV2CallOptions {
  const newOptions = { ...options };

  // Get base values from config or use defaults
  const baseTemp = baseConfig?.temperature ?? 0.7;
  const baseTopP = baseConfig?.topP ?? 0.9;
  const baseTopK = baseConfig?.topK ?? 40;
  const baseMaxTokens = baseConfig?.maxOutputTokens ?? 8192;

  // Apply adjustments (clamped to valid ranges)
  if (adjustment.temperature !== undefined) {
    const currentTemp = (options as any).temperature ?? baseTemp;
    (newOptions as any).temperature = Math.max(0, Math.min(2, currentTemp + adjustment.temperature));
  }

  if (adjustment.topP !== undefined) {
    const currentTopP = (options as any).topP ?? baseTopP;
    (newOptions as any).topP = Math.max(0, Math.min(1, currentTopP + adjustment.topP));
  }

  if (adjustment.topK !== undefined) {
    const currentTopK = (options as any).topK ?? baseTopK;
    (newOptions as any).topK = Math.max(1, currentTopK + adjustment.topK);
  }

  if (adjustment.maxOutputTokens !== undefined) {
    const currentMaxTokens = options.maxOutputTokens ?? baseMaxTokens;
    newOptions.maxOutputTokens = currentMaxTokens + adjustment.maxOutputTokens;
  }

  return newOptions;
}

/**
 * Detect module type from context or LLM name
 */
export function detectModuleType(llmName: string): ModuleType {
  const name = llmName.toLowerCase();
  if (name.includes("plan")) return "planning";
  if (name.includes("nav") || name.includes("browser")) return "navigation";
  if (name.includes("compress") || name.includes("summary")) return "compression";
  return "default";
}

/**
 * Log retry attempt with adjusted parameters
 */
export function logRetryAttempt(
  attempt: number,
  moduleType: ModuleType,
  adjustment: RetryAdjustment
): void {
  if (Log.isEnableInfo()) {
    Log.info(`Adaptive retry attempt ${attempt} for ${moduleType} module`, {
      adjustments: adjustment,
    });
  }
}
