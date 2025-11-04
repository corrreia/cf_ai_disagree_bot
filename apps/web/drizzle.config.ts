import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/server/schemas/",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: ignore as this is a development environment
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    // biome-ignore lint/style/noNonNullAssertion: ignore as this is a development environment
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    // biome-ignore lint/style/noNonNullAssertion: ignore as this is a development environment
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
  verbose: true,
  strict: true,
});
