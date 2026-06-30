import { boolean, pgTable, text, timestamp, varchar, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  phone: varchar("phone", { length: 16 }).primaryKey(),
  role: text("role", { enum: ["kirana", "wholesaler", "admin"] }).notNull(),
  name: text("name").notNull(),
  shopName: text("shop_name").notNull(),
  language: text("language", { enum: ["en", "hi", "te"] }).notNull().default("te"),
  trustedWholesalerId: text("trusted_wholesaler_id"),
  wholesalerId: text("wholesaler_id"),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  gstin: varchar("gstin", { length: 20 }),
  fssai: varchar("fssai", { length: 20 }),
  verified: boolean("verified").notNull().default(false),
  // Rolling average rating across delivered orders. NULL until they have
  // at least one rated order. Updated atomically on each rating submit.
  rating: doublePrecision("rating"),
  ratingCount: doublePrecision("rating_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
