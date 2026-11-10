import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { randomUUID } from 'node:crypto';

import { createLoggerConfig } from './logger.config.js';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomUUID: vi.fn(() => 'mocked-uuid') };
});

const mockRandomUUID = vi.mocked(randomUUID);

function createRequest(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function createResponse() {
  const setHeader = vi.fn((name: string, value: string) => undefined);
  const response = {
    setHeader,
  } as unknown as ServerResponse;
  return { response, setHeader };
}

describe('createLoggerConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockRandomUUID.mockClear();
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use debug level and pretty transport outside production', () => {
    const config = createLoggerConfig('order-service');

    expect(config.pinoHttp.level).toBe('debug');
    expect(config.pinoHttp.transport?.target).toBe('pino-pretty');
    expect(config.pinoHttp.transport?.options.colorize).toBe(true);
  });

  it('should honor LOG_LEVEL outside production', () => {
    process.env.LOG_LEVEL = 'warn';
    const config = createLoggerConfig('order-service');

    expect(config.pinoHttp.level).toBe('warn');
  });

  it('should use info level and no transport in production', () => {
    process.env.NODE_ENV = 'production';
    const config = createLoggerConfig('order-service');

    expect(config.pinoHttp.level).toBe('info');
    expect(config.pinoHttp.transport).toBeUndefined();
  });

  it('should use a valid x-request-id and set the response header', () => {
    const req = createRequest({ 'x-request-id': 'req-123' });
    const { response: res, setHeader } = createResponse();
    const config = createLoggerConfig('order-service');

    const id = config.pinoHttp.genReqId!(req, res);

    expect(id).toBe('req-123');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'req-123');
    expect(mockRandomUUID).not.toHaveBeenCalled();
  });

  it('should generate a UUID for an invalid x-request-id', () => {
    const req = createRequest({ 'x-request-id': '../../../etc/passwd' });
    const { response: res, setHeader } = createResponse();
    const config = createLoggerConfig('order-service');

    const id = config.pinoHttp.genReqId!(req, res);

    expect(id).toBe('mocked-uuid');
    expect(id).not.toBe(req.headers['x-request-id']);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'mocked-uuid');
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });

  it('should generate a UUID when x-request-id is missing', () => {
    const req = createRequest({});
    const { response: res, setHeader } = createResponse();
    const config = createLoggerConfig('order-service');

    const id = config.pinoHttp.genReqId!(req, res);

    expect(id).toBe('mocked-uuid');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'mocked-uuid');
  });

  it('should include service name and request id in custom props', () => {
    const req = { id: 'req-1' } as unknown as IncomingMessage & { id?: string };
    const config = createLoggerConfig('payment-service');

    const props = config.pinoHttp.customProps!(req);

    expect(props).toEqual({ service: 'payment-service', requestId: 'req-1' });
  });

  it('should redact sensitive request and response paths', () => {
    const config = createLoggerConfig('order-service');

    const { redact } = config.pinoHttp;
    expect(redact?.paths).toContain('req.headers.authorization');
    expect(redact?.paths).toContain('req.headers.cookie');
    expect(redact?.paths).toContain('req.body.password');
    expect(redact?.paths).toContain('req.body.currentPassword');
    expect(redact?.paths).toContain('req.body.newPassword');
    expect(redact?.paths).toContain('req.body.accessToken');
    expect(redact?.paths).toContain('req.body.refreshToken');
    expect(redact?.paths).toContain('res.headers.set-cookie');
    expect(redact?.censor).toBe('[REDACTED]');
  });
});
