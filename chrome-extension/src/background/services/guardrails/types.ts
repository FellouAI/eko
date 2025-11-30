/**
 * Simple security guardrails type definitions
 * Focused on content sanitization and basic threat detection
 */

/**
 * Simplified threat types for v1
 */
export enum ThreatType {
  // Core threats
  TASK_OVERRIDE = 'task_override',
  PROMPT_INJECTION = 'prompt_injection',
  SENSITIVE_DATA = 'sensitive_data',
  DANGEROUS_ACTION = 'dangerous_action',
}

/**
 * Simplified security pattern
 */
export interface SecurityPattern {
  pattern: RegExp;
  type: ThreatType;
  description: string;
  replacement?: string; // What to replace the matched pattern with
}

/**
 * Sanitization result
 */
export interface SanitizationResult {
  sanitized: string;
  threats: ThreatType[];
  modified: boolean;
}

/**
 * Future extensibility - validation result
 */
export interface ValidationResult {
  isValid: boolean;
  threats?: ThreatType[];
  message?: string;
}
