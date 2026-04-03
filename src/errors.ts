import type { CheckResult } from './types.js';

/**
 * Base error class for AIProxyGuard SDK errors.
 */
export class AIProxyGuardError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'AIProxyGuardError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the request is invalid or malformed.
 */
export class ValidationError extends AIProxyGuardError {
  constructor(message: string, code: string = 'invalid_request') {
    super(message, code, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when unable to connect to the AIProxyGuard service.
 */
export class ConnectionError extends AIProxyGuardError {
  constructor(message: string = 'Failed to connect to AIProxyGuard') {
    super(message, 'connection_error');
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when a request times out.
 */
export class TimeoutError extends AIProxyGuardError {
  constructor(message: string = 'Request timed out') {
    super(message, 'timeout');
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when rate limited by the service.
 */
export class RateLimitError extends AIProxyGuardError {
  constructor(
    message: string = 'Rate limited',
    public readonly retryAfter?: number
  ) {
    super(message, 'rate_limit', 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Thrown when content is blocked due to detected prompt injection.
 */
export class ContentBlockedError extends AIProxyGuardError {
  constructor(public readonly result: CheckResult) {
    const threatTypes = result.threats.map((t) => t.type).join(', ');
    super(`Content blocked: ${threatTypes || 'unknown'}`, 'content_blocked', 400);
    this.name = 'ContentBlockedError';
  }
}
