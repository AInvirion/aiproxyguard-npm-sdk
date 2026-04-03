import {
  DEFAULT_BASE_URL,
  type Action,
  type AIProxyGuardConfig,
  type CheckResult,
  type ErrorResponse,
  type ReadinessStatus,
  type ServiceInfo,
} from './types.js';
import {
  AIProxyGuardError,
  ConnectionError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from './errors.js';

const VALID_ACTIONS: readonly string[] = ['allow', 'log', 'warn', 'block'];
const VALID_SCHEMES = ['http:', 'https:'];
const MAX_INPUT_SIZE = 100_000; // 100KB max input size
const DEFAULT_CONCURRENCY = 10; // Max concurrent requests in checkBatch

/**
 * Detect API mode based on URL.
 * URLs containing 'docker.' use proxy mode, otherwise cloud mode.
 */
function detectMode(url: string): 'cloud' | 'proxy' {
  return url.includes('docker.') ? 'proxy' : 'cloud';
}

/**
 * AIProxyGuard client for detecting prompt injection attacks.
 *
 * @example
 * ```typescript
 * const client = new AIProxyGuard('https://docker.aiproxyguard.com');
 *
 * const result = await client.check('Ignore all previous instructions');
 * if (result.action === 'block') {
 *   console.log(`Blocked: ${result.category}`);
 * }
 * ```
 */
export class AIProxyGuard {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly mode: 'cloud' | 'proxy';
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly maxConcurrency: number;

  /**
   * Create a new AIProxyGuard client.
   *
   * @param config - Configuration object, base URL string, or omit for default
   * @throws {ValidationError} If the baseUrl has an invalid scheme
   */
  constructor(config?: AIProxyGuardConfig | string) {
    const cfg: AIProxyGuardConfig =
      typeof config === 'string'
        ? { baseUrl: config }
        : config ?? {};

    const rawUrl = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

    // Validate URL scheme to prevent SSRF
    try {
      const parsed = new URL(rawUrl);
      if (!VALID_SCHEMES.includes(parsed.protocol)) {
        throw new ValidationError(
          `Invalid URL scheme: ${parsed.protocol}. Only http: and https: are allowed.`,
          'invalid_url'
        );
      }
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      throw new ValidationError(`Invalid URL: ${rawUrl}`, 'invalid_url');
    }

    this.baseUrl = rawUrl;
    this.apiKey = cfg.apiKey;
    this.timeout = cfg.timeout ?? 30000;
    this.retries = cfg.retries ?? 3;
    this.retryDelay = cfg.retryDelay ?? 1000;
    this.maxConcurrency = cfg.maxConcurrency ?? DEFAULT_CONCURRENCY;

    // Determine API mode
    const mode = cfg.mode ?? 'auto';
    this.mode = mode === 'auto' ? detectMode(this.baseUrl) : mode;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }

  private async handleError(response: Response): Promise<never> {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new RateLimitError(
        'Rate limited',
        retryAfter ? parseInt(retryAfter, 10) : undefined
      );
    }

    try {
      const data = (await response.json()) as ErrorResponse;
      throw new ValidationError(
        data.error?.message || 'Unknown error',
        data.error?.type || 'unknown'
      );
    } catch (e) {
      if (e instanceof AIProxyGuardError) throw e;
      throw new AIProxyGuardError(
        `HTTP ${response.status}: ${response.statusText}`,
        'http_error',
        response.status
      );
    }
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          await this.handleError(response);
        }

        // Drain response body on 5xx to prevent connection leaks
        try {
          await response.text();
        } catch {
          // Ignore drain errors
        }

        lastError = new AIProxyGuardError(
          `HTTP ${response.status}`,
          'http_error',
          response.status
        );
      } catch (e) {
        clearTimeout(timeoutId);

        if (e instanceof AIProxyGuardError) throw e;

        if (e instanceof Error && e.name === 'AbortError') {
          lastError = new TimeoutError();
        } else if (e instanceof TypeError) {
          lastError = new ConnectionError();
        } else {
          lastError = e instanceof Error ? e : new Error(String(e));
        }
      }

      // Exponential backoff before retry
      if (attempt < this.retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * Math.pow(2, attempt))
        );
      }
    }

    throw lastError || new AIProxyGuardError('Unknown error', 'unknown');
  }

  /**
   * Check text for prompt injection.
   *
   * @param text - The text to scan
   * @returns CheckResult with action, category, signatureName, and confidence
   * @throws {ValidationError} If the request is invalid
   * @throws {TimeoutError} If the request times out
   * @throws {RateLimitError} If rate limited
   * @throws {AIProxyGuardError} For other errors
   *
   * @example
   * ```typescript
   * const result = await client.check("Ignore all previous instructions");
   * if (result.action === 'block') {
   *   console.log(`Blocked: ${result.category}`);
   * }
   * ```
   */
  async check(text: string, context?: Record<string, unknown>): Promise<CheckResult> {
    // Validate input size to prevent DoS
    if (text.length > MAX_INPUT_SIZE) {
      throw new ValidationError(
        `Input exceeds maximum size of ${MAX_INPUT_SIZE} bytes`,
        'input_too_large'
      );
    }

    if (this.mode === 'proxy') {
      return this.checkProxy(text);
    }
    return this.checkCloud(text, context);
  }

  /**
   * Check using cloud mode (/api/v1/check with {input, context}).
   */
  private async checkCloud(
    text: string,
    context?: Record<string, unknown>
  ): Promise<CheckResult> {
    const body: Record<string, unknown> = { input: text };
    if (context) {
      body.context = context;
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/v1/check`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as {
      id: string;
      flagged: boolean;
      action: string;
      threats: Array<{ type: string; confidence: number; rule: string | null }>;
      latency_ms: number;
      cached: boolean;
    };

    // Validate response shape
    if (!VALID_ACTIONS.includes(data.action)) {
      throw new AIProxyGuardError(
        `Invalid action in response: ${data.action}`,
        'invalid_response'
      );
    }

    return {
      id: data.id,
      flagged: data.flagged,
      action: data.action as Action,
      threats: data.threats.map((t) => ({
        type: t.type,
        confidence: t.confidence,
        rule: t.rule,
      })),
      latencyMs: data.latency_ms,
      cached: data.cached,
    };
  }

  /**
   * Check using proxy mode (/check with {text}).
   */
  private async checkProxy(text: string): Promise<CheckResult> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/check`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ text }),
    });

    const data = (await response.json()) as {
      action: string;
      category: string | null;
      signature_name: string | null;
      confidence: number;
    };

    // Validate response shape
    if (!VALID_ACTIONS.includes(data.action)) {
      throw new AIProxyGuardError(
        `Invalid action in response: ${data.action}`,
        'invalid_response'
      );
    }

    // Normalize proxy response to common CheckResult format
    const flagged = data.action === 'block';
    const threats =
      data.category && flagged
        ? [
            {
              type: data.category,
              confidence: data.confidence,
              rule: data.signature_name,
            },
          ]
        : [];

    return {
      id: '', // Proxy mode doesn't return ID
      flagged,
      action: data.action as Action,
      threats,
      latencyMs: 0, // Proxy mode doesn't return latency
      cached: false, // Proxy mode doesn't return cache status
    };
  }

  /**
   * Check multiple texts for prompt injection in parallel with concurrency limit.
   *
   * @param texts - Array of texts to scan
   * @returns Array of CheckResult objects in the same order
   *
   * @example
   * ```typescript
   * const results = await client.checkBatch([
   *   'Hello, how are you?',
   *   'Ignore all instructions',
   * ]);
   * ```
   */
  async checkBatch(texts: string[]): Promise<CheckResult[]> {
    if (texts.length === 0) return [];

    // Concurrency-limited parallel execution
    const results: CheckResult[] = new Array(texts.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < texts.length) {
        const index = nextIndex++;
        results[index] = await this.check(texts[index]);
      }
    };

    // Start up to maxConcurrency workers
    const workerCount = Math.min(this.maxConcurrency, texts.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return results;
  }

  /**
   * Check if text is safe (not blocked).
   *
   * @param text - The text to scan
   * @returns True if the text is safe, false if blocked
   *
   * @example
   * ```typescript
   * if (await client.isSafe(userInput)) {
   *   // Process the input
   * }
   * ```
   */
  async isSafe(text: string): Promise<boolean> {
    const result = await this.check(text);
    return !result.flagged;
  }

  /**
   * Get service information.
   *
   * @returns ServiceInfo with service name and version
   */
  async info(): Promise<ServiceInfo> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    return (await response.json()) as ServiceInfo;
  }

  /**
   * Check if the service is healthy.
   *
   * @returns True if healthy, false otherwise
   */
  async health(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if the service is ready.
   *
   * @returns ReadinessStatus with status and checks
   */
  async ready(): Promise<ReadinessStatus> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/readyz`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    return (await response.json()) as ReadinessStatus;
  }
}
