// Import Manifest V3 compatible PostHog - no-external bundle to avoid CSP issues
import * as PostHog from 'posthog-js/dist/module.no-external';
const posthog = PostHog.default || PostHog;
import { analyticsSettingsStore } from '@extension/storage';
import { createLogger } from '../log';

const logger = createLogger('Analytics');

interface TaskMetrics {
  taskId: string;
  startTime: number;
}

export class AnalyticsService {
  private initialized = false;
  private enabled = false;
  private taskMetrics = new Map<string, TaskMetrics>();

  private static readonly ERROR_TYPE_CATEGORIES = {
    ChatModelAuthError: 'llm_auth_error',
    ChatModelBadRequestError: 'llm_bad_request_error',
    ChatModelForbiddenError: 'llm_forbidden_error',
    ResponseParseError: 'llm_response_parse_error',
    URLNotAllowedError: 'url_blocked_error',
    RequestCancelledError: 'request_cancelled_error',
    ExtensionConflictError: 'extension_conflict_error',
    InvalidInputError: 'invalid_input_error',
    TimeoutError: 'timeout',
    NetworkError: 'network_error',
    TypeError: 'type_error',
    ReferenceError: 'reference_error',
    SyntaxError: 'syntax_error',
    MaxStepsReachedError: 'max_steps_reached',
    MaxFailuresReachedError: 'max_failures_reached',
  } as const;

  private static readonly MESSAGE_PATTERNS: Array<[RegExp, string]> = [
    [/element not found|no such element/, 'element_not_found'],
    [/timeout|timed out/, 'timeout'],
    [/debugger|detached/, 'debugger_error'],
    [/network|fetch|connection/, 'network_error'],
    [/max steps|maxsteps/, 'max_steps_reached'],
    [/max failures|maxfailures/, 'max_failures_reached'],
    [/navigation|navigate/, 'navigation_error'],
    [/permission|denied|forbidden/, 'permission_denied'],
    [/tab|window/, 'tab_error'],
    [
      /\b(unauthorized|invalid\s*api\s*key|missing\s*api\s*key|api\s*key\s*required|no\s*api\s*key)\b/,
      'llm_config_error',
    ],
  ];

  async init(): Promise<void> {
    try {
      const settings = await analyticsSettingsStore.getSettings();
      this.enabled = settings.enabled;

      if (!this.enabled) {
        logger.info('Analytics disabled by user');
        return;
      }

      // Initialize PostHog with Manifest V3 compatible settings
      const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;

      if (!apiKey) {
        logger.info('PostHog API key not configured, analytics disabled');
        this.enabled = false;
        return;
      }

      posthog.init(apiKey, {
        api_host: 'https://app.posthog.com',
        // Manifest V3 compatibility settings
        autocapture: false, // No automatic event capture
        capture_pageview: false, // No page views
        capture_pageleave: false, // No page leave events
        disable_session_recording: true, // No recordings to avoid CSP issues
        mask_all_text: true, // Extra safety
        mask_all_element_attributes: true,
        opt_out_capturing_by_default: false, // Enabled by default per requirements
        loaded: () => {
          this.initialized = true;
          logger.info('Analytics initialized');
        },
        bootstrap: {
          distinctID: settings.anonymousUserId,
        },
        // Disable features that may cause Chrome Web Store rejections
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: {
            password: true,
            email: true,
          },
        },
        // Ensure no remote code execution
        advanced_disable_decide: true,
      });
    } catch (error) {
      logger.error('Failed to initialize analytics:', error);
      this.enabled = false;
    }
  }

  async trackTaskStart(taskId: string): Promise<void> {
    if (!this.enabled || !this.initialized) return;

    try {
      const startTime = Date.now();
      this.taskMetrics.set(taskId, { taskId, startTime });

      posthog.capture('task_started', {
        task_id: taskId,
        timestamp: startTime,
      });

      logger.debug('Tracked task start:', taskId);
    } catch (error) {
      logger.error('Failed to track task start:', error);
    }
  }

  async trackTaskComplete(taskId: string): Promise<void> {
    if (!this.enabled || !this.initialized) return;

    try {
      const metrics = this.taskMetrics.get(taskId);
      const endTime = Date.now();
      const duration = metrics ? endTime - metrics.startTime : 0;

      posthog.capture('task_completed', {
        task_id: taskId,
        duration_ms: duration,
        timestamp: endTime,
      });

      // Clean up metrics
      this.taskMetrics.delete(taskId);

      logger.debug('Tracked task completion:', taskId, `${duration}ms`);
    } catch (error) {
      logger.error('Failed to track task completion:', error);
    }
  }

  async trackTaskFailed(taskId: string, errorCategory: string): Promise<void> {
    if (!this.enabled || !this.initialized) return;

    try {
      const metrics = this.taskMetrics.get(taskId);
      const endTime = Date.now();
      const duration = metrics ? endTime - metrics.startTime : 0;

      posthog.capture('task_failed', {
        task_id: taskId,
        duration_ms: duration,
        error_category: errorCategory,
        timestamp: endTime,
      });

      // Clean up metrics
      this.taskMetrics.delete(taskId);

      logger.debug('Tracked task failure:', taskId, errorCategory, `${duration}ms`);
    } catch (error) {
      logger.error('Failed to track task failure:', error);
    }
  }

  async trackTaskCancelled(taskId: string): Promise<void> {
    if (!this.enabled || !this.initialized) return;

    try {
      const metrics = this.taskMetrics.get(taskId);
      const endTime = Date.now();
      const duration = metrics ? endTime - metrics.startTime : 0;

      posthog.capture('task_cancelled', {
        task_id: taskId,
        duration_ms: duration,
        timestamp: endTime,
      });

      // Clean up metrics
      this.taskMetrics.delete(taskId);

      logger.debug('Tracked task cancellation:', taskId, `${duration}ms`);
    } catch (error) {
      logger.error('Failed to track task cancellation:', error);
    }
  }

  async trackDomainVisit(url: string): Promise<void> {
    if (!this.enabled || !this.initialized) return;

    try {
      // Extract only the domain, no sensitive URL data
      const domain = new URL(url).hostname.toLowerCase();

      // Skip tracking for common non-interesting domains
      if (domain === 'localhost' || domain === '127.0.0.1' || domain.startsWith('chrome-')) {
        return;
      }

      posthog.capture('domain_visited', {
        domain,
        timestamp: Date.now(),
      });

      logger.debug('Tracked domain visit:', domain);
    } catch (error) {
      // Silently fail if URL parsing fails
      logger.debug('Failed to track domain visit:', error);
    }
  }

  categorizeError(error: Error | string): string {
    const matchPatterns = (message: string): string | null => {
      for (const [regex, category] of AnalyticsService.MESSAGE_PATTERNS) {
        if (regex.test(message)) return category;
      }
      return null;
    };

    // PRIORITY 1: Use actual Error object type if available
    if (error instanceof Error) {
      const errorType = error.constructor.name;
      const mapped =
        AnalyticsService.ERROR_TYPE_CATEGORIES[errorType as keyof typeof AnalyticsService.ERROR_TYPE_CATEGORIES];
      if (mapped) return mapped;

      // PRIORITY 2: Check error message for untyped errors
      const message = error.message?.toLowerCase() || '';
      const byMessage = matchPatterns(message);
      if (byMessage) return byMessage;

      // If we have an Error object but can't categorize it, return the constructor name
      return `error_${errorType.toLowerCase()}`;
    }

    // PRIORITY 3: Fallback to string-based categorization (least reliable)
    const message = typeof error === 'string' ? error.toLowerCase() : '';
    const byMessage = matchPatterns(message);
    return byMessage ?? 'unknown_error';
  }

  async updateSettings(): Promise<void> {
    try {
      const settings = await analyticsSettingsStore.getSettings();
      const wasEnabled = this.enabled;
      this.enabled = settings.enabled;

      if (!wasEnabled && this.enabled) {
        // Re-initialize if analytics was disabled and now enabled
        await this.init();
      } else if (wasEnabled && !this.enabled) {
        // Opt out if analytics was enabled and now disabled
        if (this.initialized) {
          posthog.opt_out_capturing();
          logger.info('Analytics opted out');
        }
      }
    } catch (error) {
      logger.error('Failed to update analytics settings:', error);
    }
  }
}

// Singleton instance
export const analytics = new AnalyticsService();
