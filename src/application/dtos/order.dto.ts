import { z } from "zod";
import { ORDER_STATUSES } from "@domain/value-objects/order-status";
import { MAX_BULK_ORDER_UPDATES } from "@domain/value-objects/order-limits";

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listOrdersQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["created", "total", "customer"]).default("created"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export const bulkUpdateStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_ORDER_UPDATES).refine((ids) => new Set(ids).size === ids.length, "Duplicate order ids"),
  status: z.enum(ORDER_STATUSES),
});

export const productSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
  includeInactive: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  lowStockOnly: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

const money = z.coerce.number().min(0).max(1_000_000).transform((value) => value.toFixed(2));

export const createProductSchema = z.object({
  sku: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, "Invalid SKU"),
  name: z.string().trim().min(2).max(160),
  price: money,
  cost: money,
  stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).default(5),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  price: money.optional(),
  cost: money.optional(),
  active: z.boolean().optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes provided");

export const adjustStockSchema = z.object({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, "Delta must not be zero"),
  note: z.string().trim().max(200).optional(),
});

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(1000),
  })).min(1).max(50).superRefine((items, context) => {
    const productIds = new Set(items.map((item) => item.productId));
    if (productIds.size !== items.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each product can only appear once per order",
      });
    }
  }),
});

export const editOrderSchema = createOrderSchema;

export const updateUserRoleSchema = z.object({
  role: z.enum(["admin", "operator", "viewer"]),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
