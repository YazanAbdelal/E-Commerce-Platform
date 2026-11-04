import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Global() // makes PrismaService available throughout this NestJS application without importing PrismaModule into every feature module.
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule { }