import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateProductDto } from './create-product.dto.js';
import { UpdateProductDto } from './update-product.dto.js';
import { FindProductsQueryDto } from './find-products-query.dto.js';

describe('CreateProductDto', () => {
    it('should accept valid product data', async () => {
        const dto = plainToInstance(CreateProductDto, {
            name: 'Laptop',
            price: 1200,
        });

        expect(await validate(dto)).toHaveLength(0);
    });

    it('should reject an empty name', async () => {
        const dto = plainToInstance(CreateProductDto, {
            name: '',
            price: 100,
        });

        expect((await validate(dto)).some(e => e.property === 'name')).toBe(true);
    });

    it('should reject a non-string name', async () => {
        const dto = plainToInstance(CreateProductDto, {
            name: 123,
            price: 100,
        });

        expect((await validate(dto)).some(e => e.property === 'name')).toBe(true);
    });

    it('should reject a negative price', async () => {
        const dto = plainToInstance(CreateProductDto, {
            name: 'Laptop',
            price: -1,
        });

        expect((await validate(dto)).some(e => e.property === 'price')).toBe(true);
    });

    it('should reject a non-numeric price', async () => {
        const dto = plainToInstance(CreateProductDto, {
            name: 'Laptop',
            price: 'expensive',
        });

        expect((await validate(dto)).some(e => e.property === 'price')).toBe(true);
    });
});

describe('UpdateProductDto', () => {
    it('should accept an empty update', async () => {
        const dto = plainToInstance(UpdateProductDto, {});

        expect(await validate(dto)).toHaveLength(0);
    });

    it('should accept a valid partial update', async () => {
        const dto = plainToInstance(UpdateProductDto, {
            price: 900,
        });

        expect(await validate(dto)).toHaveLength(0);
    });

    it('should reject an empty product name', async () => {
        const dto = plainToInstance(UpdateProductDto, {
            name: '',
        });

        expect((await validate(dto)).some(e => e.property === 'name')).toBe(true);
    });

    it('should reject a negative price', async () => {
        const dto = plainToInstance(UpdateProductDto, {
            price: -10,
        });

        expect((await validate(dto)).some(e => e.property === 'price')).toBe(true);
    });
});

describe('FindProductsQueryDto', () => {
    it('should apply default values', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {});

        expect(dto.page).toBe(1);
        expect(dto.limit).toBe(10);
        expect(dto.sortBy).toBe('name');
        expect(dto.order).toBe('asc');
        expect(await validate(dto)).toHaveLength(0);
    });

    it('should transform numeric query strings into numbers', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            page: '2',
            limit: '20',
            minPrice: '100',
            maxPrice: '500',
        });

        expect(dto.page).toBe(2);
        expect(dto.limit).toBe(20);
        expect(dto.minPrice).toBe(100);
        expect(dto.maxPrice).toBe(500);
        expect(await validate(dto)).toHaveLength(0);
    });

    it('should reject a page below 1', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            page: '0',
        });

        expect((await validate(dto)).some(e => e.property === 'page')).toBe(true);
    });

    it('should reject a limit above 100', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            limit: '101',
        });

        expect((await validate(dto)).some(e => e.property === 'limit')).toBe(true);
    });

    it('should reject a non-integer page', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            page: '1.5',
        });

        expect((await validate(dto)).some(e => e.property === 'page')).toBe(true);
    });

    it('should reject negative minimum prices', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            minPrice: '-10',
        });

        expect((await validate(dto)).some(e => e.property === 'minPrice')).toBe(true);
    });

    it('should reject negative maximum prices', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            maxPrice: '-10',
        });

        expect((await validate(dto)).some(e => e.property === 'maxPrice')).toBe(true);
    });

    it('should reject an unsupported sort field', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            sortBy: 'createdAt',
        });

        expect((await validate(dto)).some(e => e.property === 'sortBy')).toBe(true);
    });

    it('should reject an unsupported sort order', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            order: 'random',
        });

        expect((await validate(dto)).some(e => e.property === 'order')).toBe(true);
    });

    it('should reject a non-string search value', async () => {
        const dto = plainToInstance(FindProductsQueryDto, {
            search: 123,
        });

        expect((await validate(dto)).some(e => e.property === 'search')).toBe(true);
    });
});