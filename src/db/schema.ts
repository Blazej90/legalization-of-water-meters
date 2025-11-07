import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  boolean,
  date,
  pgEnum,
  text,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["ADMIN", "INSPECTOR"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: varchar("clerk_user_id", { length: 191 }).notNull().unique(),
  name: varchar("name", { length: 191 }).notNull(),
  email: varchar("email", { length: 191 }).notNull(),
  role: roleEnum("role").notNull().default("INSPECTOR"),
});

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  applicantName: varchar("applicant_name", { length: 191 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  plannedCount: integer("planned_count").notNull(),
  notes: text("notes"),
});

export const workDays = pgTable("work_days", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  isOpen: boolean("is_open").notNull().default(true),
  notes: text("notes"),
});

export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),

  requestId: integer("request_id").notNull(), // + FK jak u Ciebie
  workDayId: integer("work_day_id").notNull(),
  inspectorId: integer("inspector_id").notNull(),

  // ⬇️ NOWE KOLUMNY – nazwy w DB w snake_case,
  //    klucze eksportowane do TS w camelCase,
  //    MUSZĄ mieć default(0) i notNull()
  countSmall: integer("count_small").notNull().default(0),
  countLarge: integer("count_large").notNull().default(0),
  countCoupled: integer("count_coupled").notNull().default(0),

  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id")
    .notNull()
    .references(() => users.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  prev: text("prev"),
  next: text("next"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const schema = {
  users,
  requests,
  workDays,
  entries,
  auditLogs,
  roleEnum,
};
