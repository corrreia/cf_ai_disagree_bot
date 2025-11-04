import type { ServerLoadEvent } from "@sveltejs/kit";

export const load = async ({ locals }: ServerLoadEvent) => ({
  user: locals?.user ?? undefined,
});
