import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateUserDto } from './update-user.dto.js';

describe('UpdateUserDto', () => {
    it('should accept an empty update', async () => {
        const dto = plainToInstance(UpdateUserDto, {});

        expect(await validate(dto)).toHaveLength(0);
    });

    it('should accept a valid email update', async () => {
        const dto = plainToInstance(UpdateUserDto, {
            email: 'new@example.com',
        });

        expect(await validate(dto)).toHaveLength(0);
    });

    it('should accept a valid password update', async () => {
        const dto = plainToInstance(UpdateUserDto, {
            currentPassword: 'old-password',
            newPassword: 'new-password',
        });

        expect(await validate(dto)).toHaveLength(0);
    });

    it('should reject an invalid email', async () => {
        const dto = plainToInstance(UpdateUserDto, {
            email: 'not-an-email',
        });

        expect((await validate(dto)).some(e => e.property === 'email')).toBe(true);
    });

    it('should reject a new password shorter than 8 characters', async () => {
        const dto = plainToInstance(UpdateUserDto, {
            newPassword: 'short',
        });

        expect((await validate(dto)).some(e => e.property === 'newPassword')).toBe(true);
    });

    it('should reject a new password longer than 72 characters', async () => {
        const dto = plainToInstance(UpdateUserDto, {
            newPassword: 'a'.repeat(73),
        });

        expect((await validate(dto)).some(e => e.property === 'newPassword')).toBe(true);
    });

    it('should reject a non-string current password', async () => {
        const dto = plainToInstance(UpdateUserDto, {
            currentPassword: 12345678,
        });

        expect((await validate(dto)).some(e => e.property === 'currentPassword')).toBe(true);
    });

    it('should reject a non-string new password', async () => {
        const dto = plainToInstance(UpdateUserDto, {
            newPassword: 12345678,
        });

        expect((await validate(dto)).some(e => e.property === 'newPassword')).toBe(true);
    });
});