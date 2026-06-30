import { boolean, doublePrecision, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wholesalersTable = pgTable("wholesalers", {
  id: varchar("id", { length: 32 }).primaryKey(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerPhone: varchar("owner_phone", { length: 16 }).notNull(),
  location: text("location").notNull(),
  distance: text("distance").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  rating: doublePrecision("rating").notNull().default(4.5),
  specialOffer: text("special_offer"),
  active: boolean("active").notNull().default(true),
  gstin: varchar("gstin", { length: 20 }),
  fssai: varchar("fssai", { length: 20 }),
  verified: boolean("verified").notNull().default(false),
  defaultTaxPercent: doublePrecision("default_tax_percent").notNull().default(0),
  defaultDiscountPercent: doublePrecision("default_discount_percent").notNull().default(0),
  defaultDeliveryTime: text("default_delivery_time"),
  fromAddress: text("from_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWholesalerSchema = createInsertSchema(wholesalersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertWholesaler = z.infer<typeof insertWholesalerSchema>;
export type Wholesaler = typeof wholesalersTable.$inferSelect;
