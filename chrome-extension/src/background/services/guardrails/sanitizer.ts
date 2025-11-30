/**
 * Content sanitizer for removing malicious patterns from untrusted content
 */

import type { SanitizationResult, ThreatType } from './types';
import { getPatterns } from './patterns';
import { createLogger } from '@src/background/log';

const logger = createLogger('SecuritySanitizer');

/**
 * Sanitize untrusted content by removing dangerous patterns
 * @param content - Raw untrusted content
 * @param strict - Use strict mode with additional patterns
 * @returns Sanitization result with cleaned content and detected threats
 * @throws Error if pattern processing fails
 */
export function sanitizeContent(content: string | undefined, strict: boolean = false): SanitizationResult {
  if (!content || content.trim() === '') {
    return {
      sanitized: '',
      threats: [],
      modified: false,
    };
  }

  let sanitized = content.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '');
  const detectedThreats = new Set<ThreatType>();
  let wasModified = false;

  // Get security patterns based on strictness level
  const patterns = getPatterns(strict);

  // Apply each pattern
  for (const securityPattern of patterns) {
    try {
      const originalLength = sanitized.length;

      // Create fresh regex instance to avoid state pollution
      const regex = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

      // Check if pattern matches
      if (regex.test(sanitized)) {
        detectedThreats.add(securityPattern.type);

        // Create another fresh instance for replacement
        const replacementRegex = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

        // Apply replacement
        sanitized = sanitized.replace(replacementRegex, securityPattern.replacement || '');

        // Track if content was modified
        if (sanitized.length !== originalLength) {
          wasModified = true;
          logger.debug(`Sanitized ${securityPattern.type}: ${securityPattern.description}`);
        }
      }
    } catch (error) {
      logger.error(`Error processing pattern ${securityPattern.type}:`, error);
      // Continue with other patterns rather than failing completely
    }
  }

  // Clean up any double spaces or empty lines created by replacements
  if (wasModified) {
    sanitized = sanitized
      .replace(/[^\S\r\n]+/g, ' ') // Collapse spaces/tabs only
      .replace(/\n{3,}/g, '\n\n') // Reduce 3+ blank lines to 2
      .trim();

    // Also clean up any empty tags that might remain
    sanitized = cleanEmptyTags(sanitized);
  }

  return {
    sanitized,
    threats: Array.from(detectedThreats),
    modified: wasModified,
  };
}

/**
 * Check if content contains threats without modifying it
 * Useful for validation without sanitization
 * @param content - Content to analyze for threats
 * @param strict - Use strict mode with additional patterns
 * @returns Array of detected threat types
 */
export function detectThreats(content: string, strict: boolean = false): ThreatType[] {
  if (!content || content.trim() === '') {
    return [];
  }

  const detectedThreats = new Set<ThreatType>();
  const patterns = getPatterns(strict);

  for (const securityPattern of patterns) {
    try {
      // Create fresh regex instance to avoid state pollution
      const regex = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

      if (regex.test(content)) {
        detectedThreats.add(securityPattern.type);
        logger.debug(`Threat detected: ${securityPattern.type} - ${securityPattern.description}`);
      }
    } catch (error) {
      logger.error(`Error testing pattern ${securityPattern.type}:`, error);
      // Continue with other patterns
    }
  }

  return Array.from(detectedThreats);
}

/**
 * Enhanced filtering that also removes empty tags left after sanitization
 * @param content - Content to clean up
 * @returns Content with empty tags removed
 */
export function cleanEmptyTags(content: string): string {
  // Remove empty element pairs like <tag></tag>
  const emptyPairPattern = /<(\w+)[^>]*>\s*<\/\1>/g;
  let result = content.replace(emptyPairPattern, '');
  // Remove stray empty tags like <> or </>
  const strayEmptyTagPattern = /<\s*\/?\s*>/g;
  result = result.replace(strayEmptyTagPattern, '');
  return result;
}
