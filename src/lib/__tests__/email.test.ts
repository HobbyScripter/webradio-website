/**
 * @jest-environment node
 */
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  buildAuthLink,
  getAuthLinkOrigin,
  getOutboxDirectory,
  sendTransactionalEmail,
} from '../email';

const mutableEnv = process.env as Record<string, string | undefined>;

const ORIGINAL_ENV = {
  NODE_ENV: process.env['NODE_ENV'],
  NEXTAUTH_URL: process.env['NEXTAUTH_URL'],
  EMAIL_SERVER_HOST: process.env['EMAIL_SERVER_HOST'],
  EMAIL_FROM: process.env['EMAIL_FROM'],
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('auth link origin', () => {
  it('uses NEXTAUTH_URL, never a request Host', () => {
    mutableEnv['NODE_ENV'] = 'production';
    mutableEnv['NEXTAUTH_URL'] = 'https://webradio.example';
    expect(getAuthLinkOrigin()).toBe('https://webradio.example');
  });

  it('refuses plain HTTP for a non-loopback production origin', () => {
    mutableEnv['NODE_ENV'] = 'production';
    mutableEnv['NEXTAUTH_URL'] = 'http://webradio.example';
    expect(getAuthLinkOrigin()).toBeNull();
  });

  it('allows HTTP only for an explicit loopback development origin', () => {
    mutableEnv['NODE_ENV'] = 'production';
    mutableEnv['NEXTAUTH_URL'] = 'http://127.0.0.1:3100';
    expect(getAuthLinkOrigin()).toBe('http://127.0.0.1:3100');
  });

  it('builds a token link on the configured origin', () => {
    mutableEnv['NODE_ENV'] = 'development';
    mutableEnv['NEXTAUTH_URL'] = 'https://webradio.example';
    const token = 'a'.repeat(43);

    const link = buildAuthLink('/auth/reset-password', token);
    expect(link).toBe(`https://webradio.example/auth/reset-password?token=${token}`);
  });
});

describe('development outbox', () => {
  it('writes a message locally instead of logging the token', async () => {
    mutableEnv['NODE_ENV'] = 'test';
    delete process.env['EMAIL_SERVER_HOST'];
    delete process.env['EMAIL_FROM'];

    const marker = `outbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendTransactionalEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: `marker=${marker}`,
    });

    expect(result).toEqual({ delivered: true, mode: 'outbox' });
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();

    const dir = getOutboxDirectory();
    const files = await readdir(dir);
    let found = '';
    for (const file of files) {
      const full = path.join(dir, file);
      const text = await readFile(full, 'utf8');
      if (text.includes(marker)) {
        found = full;
        break;
      }
    }

    expect(found).not.toBe('');
    if (found) {
      await rm(found, { force: true });
    }

    consoleError.mockRestore();
    consoleLog.mockRestore();
  });
});
