import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { db } from "../db/index";
// biome-ignore lint/performance/noNamespaceImport: ignore as this is database schemas
import * as authSchema from "../schemas/auth";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      ...authSchema,
    },
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  plugins: [sveltekitCookies(getRequestEvent)], // make sure this is the last plugin in the array
});
