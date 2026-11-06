import { describe, expect, it } from 'vitest';
import { ApiGatewayService } from './api-gateway.service.js';

describe('ApiGatewayService', () => {
    const service = new ApiGatewayService();

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return the greeting', () => {
        expect(service.getHello()).toBe('Hello World!');
    });
});