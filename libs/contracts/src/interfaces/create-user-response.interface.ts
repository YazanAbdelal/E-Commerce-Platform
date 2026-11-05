import type { UserRole } from '../user-role.js';

export interface CreateUserResponse {
    id: number;
    email: string;
    role: UserRole;
    createdAt: string;
}