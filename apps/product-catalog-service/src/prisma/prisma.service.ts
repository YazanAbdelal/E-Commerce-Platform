import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from '@prisma/adapter-pg';

export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const adapter = new PrismaPg({ // PostgreSQL driver adapter
            connectionString: process.env.DATABASE_URL!,
        });

        super({ adapter });
    }

    // connects when NestJS starts.
    async onModuleInit() {
        await this.$connect();
    }

    // disconnects when NestJS shuts down
    async onModuleDestroy() {
        await this.$disconnect();
    }
}