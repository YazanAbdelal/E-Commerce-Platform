import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';

describe('ApiGatewayController', () => {
  let controller: ApiGatewayController;

  const mockApiGatewayService = {
    getHello: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();

    controller = new ApiGatewayController(
      mockApiGatewayService as unknown as ApiGatewayService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return the greeting from ApiGatewayService', () => {
    mockApiGatewayService.getHello.mockReturnValue('Hello World!');

    expect(controller.getHello()).toBe('Hello World!');
    expect(mockApiGatewayService.getHello).toHaveBeenCalledOnce();
  });

  it('should propagate errors from ApiGatewayService', () => {
    mockApiGatewayService.getHello.mockImplementation(() => {
      throw new Error('Service error');
    });

    expect(() => controller.getHello()).toThrow('Service error');
  });
});