import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service.js';

@Module({
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
