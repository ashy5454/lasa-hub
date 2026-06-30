import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const otpTable = pgTable("otp_codes", {
  phone: varchar("phone", { length: 16 }).primaryKey(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
