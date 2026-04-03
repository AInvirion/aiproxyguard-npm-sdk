// Main client
export { AIProxyGuard } from './client.js';

// Types
export type {
  Action,
  AIProxyGuardConfig,
  ApiMode,
  CheckResult,
  ErrorResponse,
  HealthStatus,
  ReadinessStatus,
  ServiceInfo,
  Threat,
} from './types.js';

// Constants
export { DEFAULT_BASE_URL } from './types.js';

// Errors
export {
  AIProxyGuardError,
  ConnectionError,
  ContentBlockedError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from './errors.js';

// Middleware
export {
  guardMiddleware,
  type GuardedRequest,
  type GuardMiddlewareOptions,
} from './middleware/express.js';

// Helper functions
import type { CheckResult } from './types.js';

/**
 * Check if a CheckResult indicates the content is safe (not flagged).
 */
export function isSafe(result: CheckResult): boolean {
  return !result.flagged;
}

/**
 * Check if a CheckResult indicates the content is flagged/blocked.
 */
export function isBlocked(result: CheckResult): boolean {
  return result.flagged;
}

// Default export
export { AIProxyGuard as default } from './client.js';
