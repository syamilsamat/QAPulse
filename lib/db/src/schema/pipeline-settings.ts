import { pgTable, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";

import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pipelineSettingsTable = pgTable("pipeline_settings", {
  id: serial("id").primaryKey(),
  qaFlowEnabled: boolean("qa_flow_enabled").notNull().default(false),
  // Not every team writes Gherkin, so step 7's "UAT BDD to Test Cases" panel
  // is opt-in. Off by default — teams that don't use BDD never see it.
  bddEnabled: boolean("bdd_enabled").notNull().default(false),
  updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPipelineSettingsSchema = createInsertSchema(pipelineSettingsTable).omit({ id: true, updatedAt: true });
export type InsertPipelineSettings = z.infer<typeof insertPipelineSettingsSchema>;
export type PipelineSettings = typeof pipelineSettingsTable.$inferSelect;
