/**
 * Default API base URL (cloud mode).
 */
export const DEFAULT_BASE_URL = 'https://aiproxyguard.com';

/**
 * API mode determines endpoint paths and request/response formats.
 * - 'cloud': Uses /api/v1/check with {input} request format
 * - 'proxy': Uses /check with {text} request format
 * - 'auto': Auto-detect based on URL (aiproxyguard.com without docker. = cloud, otherwise proxy)
 */
export type ApiMode = 'cloud' | 'proxy' | 'auto';

/**
 * Action to take based on prompt injection detection result.
 */
export type Action = 'allow' | 'log' | 'warn' | 'block';

/**
 * Threat detected in the input.
 */
export interface Threat {
  /** Type of threat detected */
  type: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Rule that matched, if any */
  rule: string | null;
}

/**
 * Result from checking text for prompt injection.
 */
export interface CheckResult {
  /** Unique check ID */
  id: string;
  /** Whether the input was flagged as potentially harmful */
  flagged: boolean;
  /** Action recommended by the security proxy */
  action: Action;
  /** List of threats detected */
  threats: Threat[];
  /** Processing latency in milliseconds */
  latencyMs: number;
  /** Whether the result was served from cache */
  cached: boolean;
}

/**
 * Service information response.
 */
export interface ServiceInfo {
  service: string;
  version: string;
}

/**
 * Health check response.
 */
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
}

/**
 * Readiness check response.
 */
export interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  checks: Record<string, boolean>;
}

/**
 * Configuration options for the AIProxyGuard client.
 */
export interface AIProxyGuardConfig {
  /** Base URL of the AIProxyGuard service (default: https://aiproxyguard.com) */
  baseUrl?: string;
  /** API key for authentication (optional for some deployments) */
  apiKey?: string;
  /** API mode: 'cloud', 'proxy', or 'auto' (default: 'auto') */
  mode?: ApiMode;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Maximum concurrent requests for checkBatch (default: 10) */
  maxConcurrency?: number;
}

/**
 * Error response from the API.
 */
export interface ErrorResponse {
  error: {
    type: string;
    message: string;
    code?: string;
  };
}

/**
 * Result from submitting feedback for a check.
 */
export interface FeedbackResult {
  /** Whether the feedback was submitted successfully */
  success: boolean;
  /** The check ID that was updated */
  checkId: string;
  /** The feedback value that was recorded */
  feedback: 'confirmed' | 'false_positive';
}

/**
 * Feedback type for a check result.
 */
export type FeedbackType = 'confirmed' | 'false_positive';
