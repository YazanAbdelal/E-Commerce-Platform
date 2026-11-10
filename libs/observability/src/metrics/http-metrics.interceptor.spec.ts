import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Counter, Histogram } from '@prometheus-io/client';
import type { Request, Response } from 'express';
import { of } from 'rxjs';

import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { HTTP_REQUESTS_TOTAL, HTTP_REQUEST_DURATION } from './http-metrics.providers.js';

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/orders/1',
    baseUrl: '/api',
    route: { path: '/orders/:id' },
    ...overrides,
  } as unknown as Request;
}

function createResponse() {
  const finishHandlers = new Set<() => void>();
  const response = {
    statusCode: 201,
    once(event: string, handler: () => void) {
      if (event === 'finish') finishHandlers.add(handler);
    },
    emit(event: string) {
      if (event === 'finish') {
        finishHandlers.forEach((handler) => handler());
        finishHandlers.clear();
      }
    },
  } as unknown as Response;
  return { response, emitFinish: () => response.emit('finish') };
}

function createContext(request: Request, response: Response): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('HttpMetricsInterceptor', () => {
  let requestCounter: Counter<string>;
  let requestDuration: Histogram<string>;
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    requestCounter = { inc: vi.fn() } as unknown as Counter<string>;
    requestDuration = { observe: vi.fn() } as unknown as Histogram<string>;
    interceptor = new HttpMetricsInterceptor(requestCounter, requestDuration);
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip Prometheus scraping and return the handler immediately', async () => {
    const request = createRequest({ path: '/metrics', route: undefined });
    const response = createResponse().response;
    const context = createContext(request, response);
    const next = { handle: vi.fn(() => of('ok')) } as unknown as CallHandler;

    const result = interceptor.intercept(context, next);

    await new Promise<void>((resolve) => result.subscribe({ next: () => {}, complete: resolve }));
    expect(requestCounter.inc).not.toHaveBeenCalled();
    expect(requestDuration.observe).not.toHaveBeenCalled();
  });

  it('should record request duration and counter on response finish', () => {
    const request = createRequest();
    const { response, emitFinish } = createResponse();
    const context = createContext(request, response);
    const next = { handle: vi.fn(() => of('ok')) } as unknown as CallHandler;

    const result = interceptor.intercept(context, next);

    emitFinish();

    expect(requestCounter.inc).toHaveBeenCalledWith({
      method: 'GET',
      route: '/api/orders/:id',
      status_code: '201',
    });
    expect(requestDuration.observe).toHaveBeenCalledWith(
      { method: 'GET', route: '/api/orders/:id', status_code: '201' },
      1,
    );
  });

  it('should use the unmatched route label when there is no route', () => {
    const request = createRequest({ route: undefined });
    const { response, emitFinish } = createResponse();
    const context = createContext(request, response);
    const next = { handle: vi.fn(() => of('ok')) } as unknown as CallHandler;

    interceptor.intercept(context, next);
    emitFinish();

    expect(requestCounter.inc).toHaveBeenCalledWith({
      method: 'GET',
      route: 'unmatched',
      status_code: '201',
    });
  });

  it('should fall back to / when the resolved route label is empty', () => {
    const request = createRequest({ baseUrl: '', route: { path: '' } });
    const { response, emitFinish } = createResponse();
    const context = createContext(request, response);
    const next = { handle: vi.fn(() => of('ok')) } as unknown as CallHandler;

    interceptor.intercept(context, next);
    emitFinish();

    expect(requestCounter.inc).toHaveBeenCalledWith({
      method: 'GET',
      route: '/',
      status_code: '201',
    });
  });
});
