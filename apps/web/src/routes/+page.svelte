<script lang="ts">
  import { Send } from "lucide-svelte";
  import { browser } from "$app/environment";
  import { authClient } from "$lib/auth-client";
  import Navbar from "$lib/components/navbar.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import type { PageData } from "./$types";

  type Message = {
    id: string;
    content: string;
    role: "user" | "assistant";
    timestamp: Date;
  };


  let { data = { user: undefined } }: { data?: PageData } = $props();

  let user = $state(data?.user);

  // Use reactive session from better-auth client (client-side only)
  if (browser) {
    const session = authClient(`${window.location.origin}/api/auth`).useSession();

    // Sync client-side session with state
    $effect(() => {
      const sessionData = session.get();
      const clientUser = sessionData?.data?.user;
      if (clientUser) {
        user = clientUser;
      } else {
        const hasDataUser = !!data?.user;
        if (!hasDataUser) {
          user = undefined;
        }
      }
    });

    // Subscribe to session changes
    $effect(() => {
      const unsubscribe = session.subscribe((value) => {
        user = value?.data?.user ?? data?.user;
      });
      return unsubscribe;
    });
  }

  let messages = $state<Message[]>([]);
  let inputValue = $state("");
  let messagesContainer = $state<HTMLDivElement | undefined>(undefined);
  let isLoading = $state(false);

  function scrollToBottom() {
    setTimeout(() => {
      messagesContainer?.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth",
      });
    }, 0);
  }

  async function sendMessage() {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput) {
      return;
    }
    if (!user) {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: trimmedInput,
      role: "user",
      timestamp: new Date(),
    };

    messages = [...messages, userMessage];
    inputValue = "";
    isLoading = true;
    scrollToBottom();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmedInput,
          userId: user.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error((error as { error?: string }).error || "Failed to send message");
      }

      const responseData = await response.json();

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: (responseData as { response: string }).response,
        role: "assistant",
        timestamp: new Date(),
      };

      messages = [...messages, assistantMessage];
      scrollToBottom();
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: error instanceof Error ? error.message : "Failed to send message. Please try again.",
        role: "assistant",
        timestamp: new Date(),
      };
      messages = [...messages, errorMessage];
      scrollToBottom();
    } finally {
      isLoading = false;
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="flex h-screen flex-col">
  <Navbar user={user}/>

  {#if !user}
  <div class="flex flex-1 items-center justify-center p-8">
    <Card class="w-full max-w-md shadow-lg">
      <CardHeader class="text-center space-y-2 px-6 pt-6 pb-4">
        <CardTitle class="text-3xl font-semibold">Welcome to Disagree Bot</CardTitle>
        <CardDescription class="text-base">
          Please sign in with Google to start chatting
        </CardDescription>
      </CardHeader>
    </Card>
  </div>
  {:else}
  <div class="flex flex-1 flex-col overflow-hidden">
    <!-- Messages Area -->
    <div
      bind:this={messagesContainer}
      class="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8"
    >
      <div class="container mx-auto max-w-4xl space-y-4">
        {#if messages.length === 0}
        <div class="flex h-full min-h-[400px] items-center justify-center py-12">
          <Card class="w-full max-w-md shadow-md">
            <CardHeader class="text-center space-y-2 px-6 pt-6 pb-4">
              <CardTitle class="text-2xl font-semibold">Start a conversation</CardTitle>
              <CardDescription class="text-base">
                Type a message below to begin chatting
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
        {:else}
        {#each messages as message (message.id)}
        <div
          class="flex gap-4 {message.role === 'user'
              ? 'justify-end'
              : 'justify-start'}"
        >
          <Card
            class="max-w-[85%] md:max-w-[75%] shadow-sm {message.role === 'user'
                ? 'bg-primary/5 dark:bg-primary/10'
                : ''}"
          >
            <CardContent class="p-4 md:p-5">
              <p class="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{message.content}</p>
              <p class="mt-3 text-xs text-muted-foreground">
                {new Date(message.timestamp).toLocaleTimeString()}
              </p>
            </CardContent>
          </Card>
        </div>
        {/each}
        {/if}
      </div>
    </div>

    <!-- Input Area -->
    <div class="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-4 md:px-6 lg:px-8">
      <div class="container mx-auto max-w-4xl flex gap-3">
        <Input
          bind:value={inputValue}
          onkeydown={handleKeyPress}
          placeholder="Type your message..."
          disabled={!user}
          class="flex-1"
        />
        <Button
          onclick={sendMessage}
          disabled={!user || !inputValue.trim() || isLoading}
          size="icon"
        >
          <Send class="size-4"/>
        </Button>
      </div>
    </div>
  </div>
  {/if}
</div>
