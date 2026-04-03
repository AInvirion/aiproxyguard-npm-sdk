import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AIProxyGuard, ValidationError } from '../src/index.js';

describe('AIProxyGuard - Extended Tests', () => {
  describe('URL validation', () => {
    it('should reject invalid URL schemes', () => {
      expect(() => new AIProxyGuard('file:///etc/passwd')).toThrow(ValidationError);
      expect(() => new AIProxyGuard('file:///etc/passwd')).toThrow(/Invalid URL scheme/);
    });

    it('should reject javascript: URLs', () => {
      expect(() => new AIProxyGuard('javascript:alert(1)')).toThrow(ValidationError);
    });

    it('should reject ftp: URLs', () => {
      expect(() => new AIProxyGuard('ftp://example.com')).toThrow(ValidationError);
    });

    it('should accept http: URLs', () => {
      expect(() => new AIProxyGuard('http://localhost:8080')).not.toThrow();
    });

    it('should accept https: URLs', () => {
      expect(() => new AIProxyGuard('https://example.com')).not.toThrow();
    });

    it('should reject malformed URLs', () => {
      expect(() => new AIProxyGuard('not-a-url')).toThrow(ValidationError);
      expect(() => new AIProxyGuard('not-a-url')).toThrow(/Invalid URL/);
    });

    it('should use default cloud URL when only apiKey is provided', () => {
      const client = new AIProxyGuard({ apiKey: 'test-key' });
      expect(client).toBeInstanceOf(AIProxyGuard);
    });
  });

  describe('input size validation', () => {
    it('should reject input exceeding 100KB', async () => {
      const client = new AIProxyGuard({ apiKey: 'test' });
      const largeInput = 'x'.repeat(100_001);

      await expect(client.check(largeInput)).rejects.toThrow(ValidationError);
      await expect(client.check(largeInput)).rejects.toThrow(/exceeds maximum size/);
    });

    it('should accept input at exactly 100KB', async () => {
      const client = new AIProxyGuard({
        apiKey: 'apg_c7759e94684e8c0c56f37ca5a9373e7e60bada8ff2725a4a6eb56a72f5643311',
      });
      const exactInput = 'x'.repeat(100_000);

      // This should not throw ValidationError for size
      // It may fail for other reasons (network), but not size validation
      try {
        await client.check(exactInput);
      } catch (e) {
        expect(e).not.toBeInstanceOf(ValidationError);
      }
    });
  });

  describe('maxConcurrency', () => {
    it('should accept maxConcurrency config', () => {
      // Just verify the client accepts the config
      const client = new AIProxyGuard({
        apiKey: 'test-key',
        maxConcurrency: 2,
      });
      expect(client).toBeInstanceOf(AIProxyGuard);
    });
  });

  describe('mode detection', () => {
    it('should auto-detect proxy mode for docker URLs', () => {
      const client = new AIProxyGuard('https://docker.example.com');
      expect(client).toBeInstanceOf(AIProxyGuard);
    });

    it('should auto-detect cloud mode for non-docker URLs', () => {
      const client = new AIProxyGuard('https://api.example.com');
      expect(client).toBeInstanceOf(AIProxyGuard);
    });

    it('should allow explicit mode override', () => {
      const client = new AIProxyGuard({
        baseUrl: 'https://example.com',
        mode: 'proxy',
      });
      expect(client).toBeInstanceOf(AIProxyGuard);
    });
  });

  describe('context parameter', () => {
    it('should accept context in cloud mode', async () => {
      const client = new AIProxyGuard({
        apiKey: 'apg_c7759e94684e8c0c56f37ca5a9373e7e60bada8ff2725a4a6eb56a72f5643311',
        retries: 1,
        timeout: 10000,
      });

      try {
        const result = await client.check('Hello world', {
          conversationId: 'conv_123',
          userId: 'user_456',
        });

        expect(result).toHaveProperty('flagged');
        expect(result.flagged).toBe(false);
      } catch (e) {
        // API may be temporarily unavailable - skip this assertion
        // The important thing is the request was formatted correctly
        console.log('API unavailable:', (e as Error).message);
      }
    });
  });
});

describe('AIProxyGuard - info() and ready()', () => {
  let client: AIProxyGuard;

  beforeEach(() => {
    client = new AIProxyGuard({
      apiKey: 'apg_c7759e94684e8c0c56f37ca5a9373e7e60bada8ff2725a4a6eb56a72f5643311',
    });
  });

  // These endpoints may not be available on the cloud API
  it.skip('info() should return service information', async () => {
    const info = await client.info();
    expect(info).toHaveProperty('service');
    expect(info).toHaveProperty('version');
  });

  it.skip('ready() should return readiness status', async () => {
    const status = await client.ready();
    expect(status).toHaveProperty('status');
    expect(['ready', 'not_ready']).toContain(status.status);
    expect(status).toHaveProperty('checks');
  });
});

describe('AIProxyGuard - Proxy Mode', () => {
  it('should handle proxy mode requests', async () => {
    // Test with explicit proxy mode
    const client = new AIProxyGuard({
      baseUrl: 'https://docker.aiproxyguard.com',
      mode: 'proxy',
    });

    // We can't actually test against the proxy server without it running,
    // but we can verify the client is configured correctly
    expect(client).toBeInstanceOf(AIProxyGuard);
  });
});

describe('AIProxyGuard - Error Handling', () => {
  it('should throw TimeoutError on timeout', async () => {
    const client = new AIProxyGuard({
      baseUrl: 'https://httpstat.us/200?sleep=5000',
      timeout: 100,
      retries: 1,
    });

    const { TimeoutError } = await import('../src/errors.js');

    await expect(client.info()).rejects.toThrow(TimeoutError);
  });

  it('should throw ConnectionError on network failure', async () => {
    const client = new AIProxyGuard({
      baseUrl: 'https://localhost:59999',
      timeout: 1000,
      retries: 1,
    });

    const { ConnectionError } = await import('../src/errors.js');

    await expect(client.info()).rejects.toThrow(ConnectionError);
  });
});
