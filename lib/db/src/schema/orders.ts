import { boolean, doublePrecision, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { wholesalersTable } from "./wholesalers";
import { usersTable } from "./users";

export const ordersTable = pgTable("orders", {
  id: varchar("id", { length: 40 }).primaryKey(),
  kiranaPhone: varchar("kirana_phone", { length: 16 })
    .notNull()
    .references(() => usersTable.phone, { onDelete: "restrict" }),
  kiranaName: text("kirana_name").notNull(),
  shopName: text("shop_name").notNull(),
  wholesalerId: varchar("wholesaler_id", { length: 32 })
    .notNull()
    .references(() => wholesalersTable.id, { onDelete: "restrict" }),
  status: text("status", {
    enum: ["pending", "confirmed", "out_for_delivery", "delivered", "cancelled"],
  })
    .notNull()
    .default("pending"),
  totalAmount: doublePrecision("total_amount"),
  subtotalAmount: doublePrecision("subtotal_amount"),
  tax: doublePrecision("tax"),
  discount: doublePrecision("discount"),
  invoiceNumber: text("invoice_number"),
  invoiceImageUrl: text("invoice_image_url"),
  paymentStatus: text("payment_status"),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  deliveryTime: text("delivery_time"),
  deliveryAddress: text("delivery_address"),
  invoiceNote: text("invoice_note"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: varchar("order_id", { length: 40 })
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameTe: text("name_te").notNull().default(""),
  nameHi: text("name_hi").notNull().default(""),
  sourceLanguage: text("source_language"),  // "en" | "te" | "hi" — detected language of the original photo/voice
  quantity: text("quantity").notNull(),
  available: boolean("available").notNull().default(true),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({
  id: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
