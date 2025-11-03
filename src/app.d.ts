// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  // biome-ignore lint/style/noNamespace: Required by SvelteKit for App.Platform type augmentation
  namespace App {
    // biome-ignore lint/style/useConsistentTypeDefinitions: Required by SvelteKit for App.Platform type augmentation
    interface Platform {
      env: Env;
      cf: CfProperties;
      ctx: ExecutionContext;
    }
    // biome-ignore lint/style/useConsistentTypeDefinitions: Required by SvelteKit for type augmentation
    interface Locals {
      session?: import("better-auth/types").Session;
      user?: import("better-auth/types").User;
    }
  }
}

export {};
