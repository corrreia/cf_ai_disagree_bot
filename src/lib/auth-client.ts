import { createAuthClient } from "better-auth/svelte";
import { browser } from "$app/environment";

// Get base URL from current location on client, or use a default
const getBaseURL = () => {
  if (browser) {
    return `${window.location.origin}/api/auth`;
  }
  // Fallback for SSR (though auth client is typically client-only)
  return "/api/auth";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});
