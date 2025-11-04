import { createAuthClient } from "better-auth/svelte";

export const authClient = (url: string) =>
  createAuthClient({
    baseURL: url,
  });
