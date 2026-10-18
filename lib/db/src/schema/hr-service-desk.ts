import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const policyDocumentsTable = pgTable("hr_policy_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  sourceName: text("source_name").notNull(),
  content: text("content").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceRequestsTable = pgTable("hr_service_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  employeeEmail: text("employee_email"),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("submitted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const hrConversationsTable = pgTable("hr_conversations", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  unresolvedCount: integer("unresolved_count").notNull().default(0),
  escalated: boolean("escalated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const hrEscalationsTable = pgTable("hr_escalations", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  employeeEmail: text("employee_email"),
  conversationId: text("conversation_id").references(() => hrConversationsTable.id, { onDelete: "set null" }),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPolicyDocumentSchema = createInsertSchema(policyDocumentsTable).omit({ createdAt: true });
export const insertServiceRequestSchema = createInsertSchema(serviceRequestsTable).omit({ createdAt: true, updatedAt: true });
export const insertHrConversationSchema = createInsertSchema(hrConversationsTable).omit({ createdAt: true, updatedAt: true });
export const insertHrEscalationSchema = createInsertSchema(hrEscalationsTable).omit({ createdAt: true, updatedAt: true });

export type InsertPolicyDocument = z.infer<typeof insertPolicyDocumentSchema>;
export type PolicyDocument = typeof policyDocumentsTable.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequest = typeof serviceRequestsTable.$inferSelect;
export type InsertHrConversation = z.infer<typeof insertHrConversationSchema>;
export type HrConversation = typeof hrConversationsTable.$inferSelect;
export type InsertHrEscalation = z.infer<typeof insertHrEscalationSchema>;
export type HrEscalation = typeof hrEscalationsTable.$inferSelect;
