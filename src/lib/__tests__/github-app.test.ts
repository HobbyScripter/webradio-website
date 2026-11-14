import { generateKeyPairSync, createHmac } from 'node:crypto';
import {
  generateGitHubAppJwt,
  verifyGitHubWebhookSignature,
} from '../github-app';

describe('GitHub App Authentication & Webhook Verification', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  describe('generateGitHubAppJwt', () => {
    it('generates a valid 3-part RS256 JWT with correct claims', () => {
      const appId = '123456';
      const jwt = generateGitHubAppJwt(appId, privateKey);

      expect(typeof jwt).toBe('string');
      const parts = jwt.split('.');
      expect(parts.length).toBe(3);

      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
      expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });

      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
      expect(payload.iss).toBe(appId);
      expect(payload.exp).toBeGreaterThan(payload.iat);
      expect(payload.exp - payload.iat).toBe(600); // 10 minutes total window
    });
  });

  describe('verifyGitHubWebhookSignature', () => {
    const secret = 'super-secret-webhook-key-12345';
    const payload = JSON.stringify({ action: 'published', release: { id: 9876 } });

    it('accepts valid HMAC SHA-256 signature', () => {
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const isValid = verifyGitHubWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('rejects tampered payload', () => {
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const tamperedPayload = JSON.stringify({ action: 'deleted', release: { id: 9876 } });
      const isValid = verifyGitHubWebhookSignature(tamperedPayload, signature, secret);
      expect(isValid).toBe(false);
    });

    it('rejects wrong secret', () => {
      const hmac = createHmac('sha256', 'wrong-secret');
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const isValid = verifyGitHubWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(false);
    });

    it('rejects malformed signature headers', () => {
      expect(verifyGitHubWebhookSignature(payload, 'invalid-signature', secret)).toBe(false);
      expect(verifyGitHubWebhookSignature(payload, null, secret)).toBe(false);
      expect(verifyGitHubWebhookSignature(payload, '', secret)).toBe(false);
    });
  });
});

