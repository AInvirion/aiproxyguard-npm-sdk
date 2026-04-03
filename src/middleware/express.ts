import type { AIProxyGuard } from '../client.js';
import type { CheckResult } from '../types.js';

/**
 * Express request type (minimal interface for compatibility).
 */
interface Request {
  body?: Record<string, unknown>;
}

/**
 * Express response type (minimal interface for compatibility).
 */
interface Response {
  status(code: number): Response;
  json(data: unknown): void;
}

/**
 * Express next function type.
 */
type NextFunction = (error?: unknown) => void;

/**
 * Extended request with AIProxyGuard result attached.
 */
export interface GuardedRequest extends Request {
  aiproxyguardResult?: CheckResult;
}

/**
 * Options for the guard middleware.
 */
export interface GuardMiddlewareOptions {
  /** Field(s) in request body to check. Default: 'text' */
  textField?: string | string[];
  /** Action to take on block. Default: 'reject' */
  onBlock?: 'reject' | 'continue';
  /** Whether to reject requests with non-string field values. Default: true */
  rejectInvalidTypes?: boolean;
  /** Custom error handler */
  onError?: (error: Error, req: Request, res: Response) => void;
}

/**
 * Express middleware for prompt injection detection.
 *
 * @param client - AIProxyGuard client instance
 * @param options - Middleware options
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { AIProxyGuard } from '@aiproxyguard/sdk';
 * import { guardMiddleware } from '@aiproxyguard/sdk/middleware';
 *
 * const client = new AIProxyGuard('https://docker.aiproxyguard.com');
 *
 * app.post('/chat', guardMiddleware(client), (req, res) => {
 *   // Request already validated
 * });
 * ```
 */
export function guardMiddleware(
  client: AIProxyGuard,
  options: GuardMiddlewareOptions = {}
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    textField = 'text',
    onBlock = 'reject',
    rejectInvalidTypes = true,
    onError,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fields = Array.isArray(textField) ? textField : [textField];
      const texts: string[] = [];

      for (const field of fields) {
        const value = req.body?.[field];
        if (typeof value === 'string') {
          texts.push(value);
        } else if (value !== undefined && value !== null) {
          // Non-string value present - potential bypass attempt
          if (rejectInvalidTypes) {
            res.status(400).json({
              error: {
                type: 'invalid_input',
                message: `Field '${field}' must be a string`,
              },
            });
            return;
          }
          // If not rejecting, coerce arrays/objects to string for checking
          const coerced =
            typeof value === 'object' ? JSON.stringify(value) : String(value);
          texts.push(coerced);
        }
      }

      // Check all texts in parallel for better performance
      if (texts.length === 0) {
        next();
        return;
      }

      const results = await client.checkBatch(texts);

      for (const result of results) {
        if (result.flagged) {
          if (onBlock === 'reject') {
            res.status(400).json({
              error: {
                type: 'content_blocked',
                message: 'Potential prompt injection detected',
              },
            });
            return;
          }

          (req as GuardedRequest).aiproxyguardResult = result;
        }
      }

      next();
    } catch (error) {
      if (onError && error instanceof Error) {
        onError(error, req, res);
      } else {
        next(error);
      }
    }
  };
}
