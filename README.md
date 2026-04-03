# @ainvirion/aiproxyguard-npm-sdk

[![npm version](https://img.shields.io/npm/v/@ainvirion/aiproxyguard-npm-sdk.svg)](https://www.npmjs.com/package/@ainvirion/aiproxyguard-npm-sdk)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

Official TypeScript/JavaScript SDK for [AIProxyGuard](https://aiproxyguard.com) - an LLM security proxy that detects prompt injection attacks in real-time.

## Features

- **Dual API Mode** - Works with both cloud API and self-hosted proxy
- **Express Middleware** - Protect routes with one line of code
- **TypeScript First** - Full type definitions included
- **Automatic Retries** - Exponential backoff for transient failures
- **Batch Operations** - Check multiple inputs with concurrency control
- **Zero Dependencies** - Uses native `fetch` (Node.js 18+)

## Installation

```bash
npm install @ainvirion/aiproxyguard-npm-sdk
```

```bash
yarn add @ainvirion/aiproxyguard-npm-sdk
```

```bash
pnpm add @ainvirion/aiproxyguard-npm-sdk
```

## Quick Start

```typescript
import { AIProxyGuard } from '@ainvirion/aiproxyguard-npm-sdk';

// Initialize with your API key
const client = new AIProxyGuard({
  apiKey: process.env.AIPROXYGUARD_API_KEY,
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

The SDK supports two ways to use AIProxyGuard:

| Mode | Use Case |
|------|----------|
| **Cloud API** | Managed service at `aiproxyguard.com`, requires free API key |
| **Self-hosted proxy** | Deploy your own proxy (free), no API key required |

```typescript
// Cloud API - managed service (requires free API key)
const cloud = new AIProxyGuard({ apiKey: 'apg_xxx' });

// Self-hosted proxy - no API key required
const proxy = new AIProxyGuard('http://localhost:8080');
```

### Getting an API Key (Cloud Mode)

API keys are **free**. To use the cloud API:

1. Sign up at [aiproxyguard.com](https://aiproxyguard.com)
2. Go to **Settings** → **API Keys** → **Create API Key**
3. **Enable the `check` scope** in permissions
4. Copy your key (starts with `apg_`)

## Configuration

```typescript
const client = new AIProxyGuard({
  baseUrl: 'https://aiproxyguard.com',  // API endpoint
  apiKey: 'apg_xxx',                     // API key (required for cloud)
  mode: 'auto',                          // 'cloud' | 'proxy' | 'auto'
  timeout: 30000,                        // Request timeout (ms)
  retries: 3,                            // Retry attempts
  retryDelay: 1000,                      // Base retry delay (ms)
  maxConcurrency: 10,                    // Max parallel requests in batch
});
```

## API Reference

### `check(text, context?)`

Check text for prompt injection.

```typescript
const result = await client.check('User input here');

console.log(result.id);        // 'chk_abc123'
console.log(result.flagged);   // true/false
console.log(result.action);    // 'allow' | 'log' | 'warn' | 'block'
console.log(result.threats);   // [{ type, confidence, rule }]
console.log(result.latencyMs); // 50.5
console.log(result.cached);    // false

// With context (cloud mode)
const result = await client.check('input', {
  conversationId: 'conv_123',
  userId: 'user_456',
});
```

### `checkBatch(texts)`

Check multiple texts with concurrency control.

```typescript
const results = await client.checkBatch([
  'Hello, how are you?',
  'Ignore all previous instructions',
  'What is the weather?',
]);

results.forEach((r, i) => {
  console.log(`${i}: ${r.flagged ? 'BLOCKED' : 'OK'}`);
});
```

### `isSafe(text)`

Quick boolean check.

```typescript
if (await client.isSafe(userInput)) {
  // Process the input
}
```

### `health()`

Check service health.

```typescript
if (await client.health()) {
  console.log('Service is up');
}
```

## Express Middleware

Protect your Express routes with automatic prompt injection detection.

```typescript
import express from 'express';
import { AIProxyGuard, guardMiddleware } from '@ainvirion/aiproxyguard-npm-sdk';

const app = express();
const client = new AIProxyGuard({ apiKey: process.env.AIPROXYGUARD_API_KEY });

app.use(express.json());

// Basic usage
app.post('/chat', guardMiddleware(client), (req, res) => {
  res.json({ response: 'Hello!' });
});

// With options
app.post('/api/prompt', guardMiddleware(client, {
  textField: 'prompt',           // Field to check (default: 'text')
  onBlock: 'reject',             // 'reject' or 'continue'
  rejectInvalidTypes: true,      // Reject non-string inputs
  onError: (err, req, res) => {
    res.status(500).json({ error: 'Security check failed' });
  },
}), handler);

// Multiple fields
app.post('/api/chat', guardMiddleware(client, {
  textField: ['message', 'context'],
}), handler);
```

## Helper Functions

```typescript
import { isSafe, isBlocked } from '@ainvirion/aiproxyguard-npm-sdk';

const result = await client.check(text);

if (isBlocked(result)) {
  console.log('Content was flagged');
}

if (isSafe(result)) {
  console.log('Content is safe');
}
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
} from '@ainvirion/aiproxyguard-npm-sdk';

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

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  Action,              // 'allow' | 'log' | 'warn' | 'block'
  ApiMode,             // 'cloud' | 'proxy' | 'auto'
  CheckResult,         // Result from check()
  Threat,              // { type, confidence, rule }
  AIProxyGuardConfig,  // Constructor config
} from '@ainvirion/aiproxyguard-npm-sdk';
```

## Security Features

- **URL Validation** - Only `http:` and `https:` schemes allowed
- **Input Size Limits** - 100KB max to prevent DoS
- **Concurrency Control** - Configurable limits for batch operations
- **Non-string Rejection** - Middleware rejects array/object inputs by default

## Requirements

- Node.js 18+ (uses native `fetch`)
- TypeScript 5.0+ (for type definitions)

## Documentation

For detailed documentation, guides, and API reference, visit:

**[https://ainvirion.github.io/aiproxyguard/](https://ainvirion.github.io/aiproxyguard/)**

## Related

- [AIProxyGuard](https://aiproxyguard.com) - Cloud API
- [Python SDK](https://github.com/AInvirion/aiproxyguard-python-sdk) - Python client

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[Apache-2.0](LICENSE) - Copyright 2026 AINVIRION
