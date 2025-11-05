import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey().notNull(),
  content: text("content").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  timestamp: integer("timestamp", { mode: "number" }).notNull(),
});
