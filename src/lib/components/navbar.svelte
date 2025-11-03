<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { Button } from "$lib/components/ui/button";

  let { user: serverUser } = $props();

  let user = $state(serverUser);

  // Use reactive session from better-auth client (client-side only)
  if (browser) {
    const session = authClient.useSession();

    // Sync client-side session with state
    $effect(() => {
      const sessionData = session.get();
      const clientUser = sessionData?.data?.user;
      if (clientUser) {
        user = clientUser;
      } else {
        const hasServerUser = !!serverUser;
        if (!hasServerUser) {
          user = undefined;
        }
      }
    });

    // Subscribe to session changes
    $effect(() => {
      const unsubscribe = session.subscribe((value) => {
        user = value?.data?.user ?? serverUser;
      });
      return unsubscribe;
    });
  }

  async function handleSignIn() {
    await authClient.signIn.social({
      provider: "google",
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    await goto("/");
  }
</script>

<nav
  class="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
>
  <div class="container mx-auto flex h-16 items-center justify-between px-4">
    <div class="flex items-center gap-2">
      <h1 class="text-xl font-semibold">
        {#if user}I will disagree with {user.name ?? user.email ?? "you"}
        {:else}
        Disagree Bot
        {/if}
      </h1>
    </div>
    <div class="flex items-center gap-4">
      {#if user}
      <Button variant="outline" onclick={handleSignOut}>Sign Out</Button>
      {:else}
      <Button onclick={handleSignIn}>
        <svg
          class="mr-2 size-4"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Sign in with Google
      </Button>
      {/if}
    </div>
  </div>
</nav>
