import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { getDb } from "../db/index";
// biome-ignore lint/performance/noNamespaceImport: ignore as this is database schemas
import * as authSchema from "../schemas/auth";

function getEnv() {
  const event = getRequestEvent();
  if (!event?.platform?.env) {
    throw new Error("Environment not available. Platform not found.");
  }
  return event.platform.env as typeof event.platform.env
}

let authInstance: ReturnType<typeof betterAuth> | undefined;

export function getAuth() {
  // Cache the auth instance since env vars are stable across requests
  // We still need to call getRequestEvent() to access env, but the values are constant
  if (!authInstance) {
    const db = getDb();
    const env = getEnv();
    authInstance = betterAuth({
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
  }
  return authInstance;
}

// Export auth as a getter for backward compatibility
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop) {
    return getAuth()[prop as keyof ReturnType<typeof betterAuth>];
  },
});
