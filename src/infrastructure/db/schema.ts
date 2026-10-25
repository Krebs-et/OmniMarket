import {
  decimal,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  index,
  boolean,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["admin", "operator", "viewer"]);

export const authUsers = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  role: userRole("role").notNull().default("viewer"),
});

export const authAccounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (table) => ({
  providerAccountPk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

export const authSessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const authVerificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (table) => ({
  verificationTokenPk: primaryKey({ columns: [table.identifier, table.token] }),
}));

export const orderStatus = pgEnum("order_status", [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  status: orderStatus("status").notNull().default("PENDING"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("idx_orders_status").on(table.status),
  createdAtIdx: index("idx_orders_created_at_pagination").on(table.createdAt),
}));

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovementReason = pgEnum("stock_movement_reason", ["initial", "adjustment", "order", "cancellation"]);

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  delta: integer("delta").notNull(),
  stockAfter: integer("stock_after").notNull(),
  reason: stockMovementReason("reason").notNull(),
  note: text("note"),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  productCreatedIdx: index("idx_stock_movements_product_created").on(table.productId, table.createdAt),
}));

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orderIdx: index("idx_order_items_order_id").on(table.orderId),
  productIdx: index("idx_order_items_product_id").on(table.productId),
}));

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  previousStatus: orderStatus("previous_status").notNull(),
  newStatus: orderStatus("new_status").notNull(),
  actorEmail: text("actor_email").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orderChangedAtIdx: index("idx_order_status_history_order_changed_at").on(table.orderId, table.changedAt),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
}));

export const productsRelations = relations(products, ({ many }) => ({
  orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusHistory.orderId],
    references: [orders.id],
  }),
}));

export type Order = typeof orders.$inferSelect;
export type Product = typeof products.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
