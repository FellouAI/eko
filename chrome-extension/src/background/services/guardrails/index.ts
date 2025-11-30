/**
 * Simple security guardrails service
 * Provides content sanitization and basic security checks
 */

import { sanitizeContent, detectThreats, cleanEmptyTags } from './sanitizer';
import type { SanitizationResult, ValidationResult } from './types';
import { ThreatType } from './types';
import { createLogger } from '@src/background/log';

const logger = createLogger('SecurityGuardrails');

/**
 * Main security guardrails service
 * Kept simple for v1 with room for expansion
 */
export class SecurityGuardrails {
  private strictMode: boolean = false;
  private enabled: boolean = true;

  constructor(config?: { strictMode?: boolean; enabled?: boolean }) {
    if (config?.strictMode !== undefined) {
      this.strictMode = config.strictMode;
    }
    if (config?.enabled !== undefined) {
      this.enabled = config.enabled;
    }

    logger.info(`Security guardrails initialized - enabled: ${this.enabled}, strict: ${this.strictMode}`);
  }

  /**
   * Sanitize untrusted content
   * @param content - The content to sanitize
   * @param options - Configuration options including strict mode
   * @returns Sanitization result with cleaned content and threat information
   */
  sanitize(content: string | undefined, options?: { strict?: boolean }): SanitizationResult {
    if (!this.enabled) {
      return {
        sanitized: content || '',
        threats: [],
        modified: false,
      };
    }

    const effectiveStrict = options?.strict ?? this.strictMode;
    const result = sanitizeContent(content, effectiveStrict);

    if (result.modified && result.threats.length > 0) {
      logger.info('Threats detected during sanitization:', result.threats);
    }

    return result;
  }

  /**
   * Detect threats without modifying content
   * @param content - The content to analyze
   * @param options - Configuration options including strict mode
   * @returns Array of detected threat types
   */
  detectThreats(content: string, options?: { strict?: boolean }): ThreatType[] {
    if (!this.enabled) {
      return [];
    }
    const effectiveStrict = options?.strict ?? this.strictMode;
    return detectThreats(content, effectiveStrict);
  }

  /**
   * Validate if content is safe (for future expansion)
   * @param content - The content to validate
   * @param options - Configuration options including strict mode
   * @returns Validation result with safety status and threat information
   */
  validate(content: string, options?: { strict?: boolean }): ValidationResult {
    if (!this.enabled) {
      return { isValid: true };
    }

    const threats = this.detectThreats(content, options);

    if (threats.length === 0) {
      return { isValid: true };
    }

    // In strict mode, any threat makes content invalid
    const effectiveStrict = options?.strict ?? this.strictMode;
    if (effectiveStrict) {
      return {
        isValid: false,
        threats,
        message: `Content contains ${threats.length} security threat(s)`,
      };
    }

    // In normal mode, only critical threats are invalid
    const criticalThreats = threats.filter(t => t === ThreatType.TASK_OVERRIDE || t === ThreatType.DANGEROUS_ACTION);

    return {
      isValid: criticalThreats.length === 0,
      threats,
      message:
        criticalThreats.length > 0
          ? `Content contains ${criticalThreats.length} critical threat(s)`
          : `Content contains ${threats.length} non-critical threat(s)`,
    };
  }

  /**
   * Clean empty tags from content
   * @param content - The content to clean
   * @returns Content with empty tags removed
   */
  cleanEmptyTags(content: string): string {
    return cleanEmptyTags(content);
  }

  /**
   * Enable/disable guardrails
   * @param enabled - Whether to enable guardrails
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`Security guardrails ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set strict mode
   * @param strict - Whether to enable strict mode
   */
  setStrictMode(strict: boolean): void {
    this.strictMode = strict;
    logger.info(`Strict mode ${strict ? 'enabled' : 'disabled'}`);
  }

  /**
   * Convenience strict variants without changing global strict state
   */

  /**
   * Sanitize content using strict mode
   * @param content - The content to sanitize
   * @returns Sanitization result with strict pattern matching
   */
  sanitizeStrict(content: string | undefined): SanitizationResult {
    return this.sanitize(content, { strict: true });
  }

  /**
   * Detect threats using strict mode
   * @param content - The content to analyze
   * @returns Array of detected threat types using strict patterns
   */
  detectThreatsStrict(content: string): ThreatType[] {
    return this.detectThreats(content, { strict: true });
  }

  /**
   * Validate content using strict mode
   * @param content - The content to validate
   * @returns Validation result with strict threat detection
   */
  validateStrict(content: string): ValidationResult {
    return this.validate(content, { strict: true });
  }
}

// Export everything for direct use
export * from './types';
export * from './patterns';
export * from './sanitizer';

// Create a default instance
export const guardrails = new SecurityGuardrails();
