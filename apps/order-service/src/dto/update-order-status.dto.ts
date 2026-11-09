import { IsIn } from 'class-validator';

import { OrderStatus } from '../generated/prisma/enums.js';

export const UPDATABLE_ORDER_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.CANCELLED,
] as const;

export type UpdatableOrderStatus =
  (typeof UPDATABLE_ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsIn(UPDATABLE_ORDER_STATUSES)
  status: UpdatableOrderStatus;
}
