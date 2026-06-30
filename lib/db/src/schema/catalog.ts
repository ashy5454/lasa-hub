import { boolean, doublePrecision, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { wholesalersTable } from "./wholesalers";

export const catalogItemsTable = pgTable("catalog_items", {
  id: serial("id").primaryKey(),
  wholesalerId: varchar("wholesaler_id", { length: 32 })
    .notNull()
    .references(() => wholesalersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameTe: text("name_te").notNull().default(""),
  nameHi: text("name_hi").notNull().default(""),
  unit: text("unit").notNull(),
  pricePerUnit: doublePrecision("price_per_unit").notNull(),
  available: boolean("available").notNull().default(true),
  minOrderQty: doublePrecision("min_order_qty").notNull().default(1),
  offer: text("offer"),
  category: text("category"),
  stockQuantity: doublePrecision("stock_quantity"),
  taxPercent: doublePrecision("tax_percent"),
  discountType: text("discount_type"),
  discountValue: doublePrecision("discount_value"),
  leadTime: text("lead_time"),
  extraInfo: text("extra_info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCatalogItemSchema = createInsertSchema(catalogItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCatalogItem = z.infer<typeof insertCatalogItemSchema>;
export type CatalogItem = typeof catalogItemsTable.$inferSelect;
