import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
// biome-ignore lint/performance/noNamespaceImport: ignore as this is database schemas
import * as schema from "../schemas";

export const db = drizzle(env.DB, { schema });
