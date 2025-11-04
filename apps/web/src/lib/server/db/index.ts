import { drizzle } from "drizzle-orm/d1";
// biome-ignore lint/performance/noNamespaceImport: ignore as this is database schemas
import * as schema from "../schemas";
import { getRequestEvent } from "$app/server";

export function getDb() {
  const event = getRequestEvent();
  if (!event?.platform?.env?.DB) {
    throw new Error("Database not available. Platform or DB binding not found.");
  }
  return drizzle(event.platform.env.DB, { schema });
}
