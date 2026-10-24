import { z } from "zod";
import { ORDER_STATUSES } from "@domain/value-objects/order-status";

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
