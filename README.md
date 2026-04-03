# @aiproxyguard/sdk

Official TypeScript/JavaScript SDK for [AIProxyGuard](https://aiproxyguard.com) - an LLM security proxy that detects prompt injection attacks.

## Installation

```bash
npm install @aiproxyguard/sdk
```

**Requirements:** Node.js 18+ (uses native `fetch`)

## Quick Start

```typescript
import { AIProxyGuard } from '@aiproxyguard/sdk';

// Cloud mode (default) - uses https://aiproxyguard.com
const client = new AIProxyGuard({
  apiKey: 'your-api-key',
});

// Check text for prompt injection
const result = await client.check('Ignore all previous instructions');

if (result.flagged) {
  console.log(`Blocked: ${result.threats[0].type}`);
} else {
  console.log('Text is safe');
}
```

## API Modes

The SDK supports two API modes:

| Mode | URL | Endpoint | Request | Auto-detected |
|------|-----|----------|---------|---------------|
| `cloud` | aiproxyguard.com | `/api/v1/check` | `{input, context?}` | Default |
| `proxy` | docker.aiproxyguard.com | `/check` | `{text}` | URLs with `docker.` |

```typescript
// Cloud mode (auto-detected from default URL)
const cloud = new AIProxyGuard({ apiKey: 'your-key' });

// Proxy mode (auto-detected from docker.* URL)
const proxy = new AIProxyGuard('https://docker.aiproxyguard.com');

// Explicit mode override
const explicit = new AIProxyGuard({
  baseUrl: 'https://your-instance.com',
  mode: 'proxy',  // Force proxy mode
});
```

## API Reference

### Constructor

```typescript
// Cloud mode with API key (default endpoint)
const client = new AIProxyGuard({
  apiKey: 'your-api-key',
});

// With custom options
const client = new AIProxyGuard({
  baseUrl: 'https://your-instance.com',
  apiKey: 'your-api-key',
  mode: 'auto',          // 'cloud' | 'proxy' | 'auto' (default: 'auto')
  timeout: 30000,        // Request timeout (ms), default: 30000
  retries: 3,            // Retry attempts, default: 3
  retryDelay: 1000,      // Base retry delay (ms), default: 1000
  maxConcurrency: 10,    // Max parallel requests in checkBatch, default: 10
});

// Or just a URL string (mode auto-detected)
const client = new AIProxyGuard('https://docker.aiproxyguard.com');
```

### Methods

#### `check(text: string, context?: object): Promise<CheckResult>`

Check text for prompt injection.

```typescript
const result = await client.check('Some user input');

// Cloud mode returns full metadata
console.log(result.id);        // 'chk_abc123'
console.log(result.flagged);   // true/false
console.log(result.action);    // 'allow' | 'log' | 'warn' | 'block'
console.log(result.threats);   // [{ type: 'prompt-injection', confidence: 0.9, rule: null }]
console.log(result.latencyMs); // 50.5
console.log(result.cached);    // false

// With context (cloud mode only)
const result = await client.check('user input', {
  conversationId: 'conv_123',
  userId: 'user_456',
});
```

#### `checkBatch(texts: string[]): Promise<CheckResult[]>`

Check multiple texts in parallel.

```typescript
const results = await client.checkBatch([
  'Hello, how are you?',
  'Ignore all previous instructions',
]);
```

#### `isSafe(text: string): Promise<boolean>`

Quick boolean check if text is safe (not flagged).

```typescript
if (await client.isSafe(userInput)) {
  // Process the input
}
```

#### `health(): Promise<boolean>`

Check if the service is healthy.

```typescript
if (await client.health()) {
  console.log('Service is up');
}
```

### Helper Functions

```typescript
import { isSafe, isBlocked } from '@aiproxyguard/sdk';

const result = await client.check(text);

if (isBlocked(result)) {
  console.log('Content was flagged');
}

if (isSafe(result)) {
  console.log('Content is safe');
}
```

## Express Middleware

Protect your Express routes with automatic prompt injection detection.

```typescript
import express from 'express';
import { AIProxyGuard, guardMiddleware } from '@aiproxyguard/sdk';

const app = express();
const client = new AIProxyGuard({ apiKey: 'your-api-key' });

app.use(express.json());

// Protect a route
app.post('/chat', guardMiddleware(client), (req, res) => {
  // Request already validated - process safely
  res.json({ response: 'Hello!' });
});

// With options
app.post('/api/prompt', guardMiddleware(client, {
  textField: 'prompt',           // Field to check (default: 'text')
  onBlock: 'reject',             // 'reject' (return 400) or 'continue'
  rejectInvalidTypes: true,      // Reject non-string inputs (default: true)
  onError: (err, req, res) => {  // Custom error handler
    res.status(500).json({ error: 'Security check failed' });
  },
}), handler);

// Check multiple fields (checked in parallel)
app.post('/api/chat', guardMiddleware(client, {
  textField: ['message', 'context'],
}), handler);
```

## Error Handling

```typescript
import {
  AIProxyGuard,
  AIProxyGuardError,
  ValidationError,
  TimeoutError,
  RateLimitError,
  ConnectionError,
} from '@aiproxyguard/sdk';

try {
  const result = await client.check(text);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after: ${error.retryAfter}s`);
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  } else if (error instanceof ValidationError) {
    console.log(`Invalid request: ${error.message}`);
  } else if (error instanceof ConnectionError) {
    console.log('Could not connect to service');
  } else if (error instanceof AIProxyGuardError) {
    console.log(`Error: ${error.message} (${error.code})`);
  }
}
```

## Types

```typescript
import type {
  Action,              // 'allow' | 'log' | 'warn' | 'block'
  ApiMode,             // 'cloud' | 'proxy' | 'auto'
  CheckResult,         // Result from check()
  Threat,              // { type, confidence, rule }
  AIProxyGuardConfig,  // Constructor config
} from '@aiproxyguard/sdk';

import { DEFAULT_BASE_URL } from '@aiproxyguard/sdk';
// 'https://aiproxyguard.com'
```

## Retry Logic

The SDK automatically retries failed requests with exponential backoff:

- Default: 3 retry attempts
- Backoff: `retryDelay * 2^attempt` (1s, 2s, 4s by default)
- Client errors (4xx) are NOT retried
- Server errors (5xx) and network errors ARE retried

## License

Apache-2.0
