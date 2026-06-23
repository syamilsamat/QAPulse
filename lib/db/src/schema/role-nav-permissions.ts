import { pgTable, integer, text, primaryKey } from "drizzle-orm/pg-core";

export const roleNavPermissionsTable = pgTable("role_nav_permissions", {
  roleId: integer("role_id").notNull(),
  permissionKey: text("permission_key").notNull(),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionKey] }),
]);

export type RoleNavPermission = typeof roleNavPermissionsTable.$inferSelect;
