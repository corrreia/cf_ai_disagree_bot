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
  import { Separator } from "$lib/components/ui/separator";
  import type { PageData } from "./$types";

  type Message = {
    id: string;
    content: string;
    role: "user" | "assistant";
    timestamp: Date;
  };

  const RESPONSE_DELAY_MS = 1000;

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

  function scrollToBottom() {
    setTimeout(() => {
      messagesContainer?.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth",
      });
    }, 0);
  }

  function sendMessage() {
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
    scrollToBottom();

    // TODO: Replace with actual API call to chatbot
    // For now, simulate a response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: "I understand your message. This is a placeholder response.",
        role: "assistant",
        timestamp: new Date(),
      };
      messages = [...messages, assistantMessage];
      scrollToBottom();
    }, RESPONSE_DELAY_MS);
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
    <Card class="max-w-md">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl">Welcome to Disagree Bot</CardTitle>
        <CardDescription>
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
      class="flex-1 overflow-y-auto p-4 space-y-4"
    >
      {#if messages.length === 0}
      <div class="flex h-full items-center justify-center">
        <Card class="max-w-md">
          <CardHeader class="text-center">
            <CardTitle>Start a conversation</CardTitle>
            <CardDescription>
              Type a message below to begin chatting
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
      {:else}
      {#each messages as message (message.id)}
      <div
        class="flex gap-3 {message.role === 'user'
            ? 'justify-end'
            : 'justify-start'}"
      >
        <Card class="max-w-[80%]">
          <CardContent class="p-4">
            <p class="text-sm whitespace-pre-wrap">{message.content}</p>
            <p class="mt-2 text-xs text-muted-foreground">
              {new Date(message.timestamp).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      </div>
      {/each}
      {/if}
    </div>

    <Separator/>

    <!-- Input Area -->
    <div class="p-4">
      <div class="container mx-auto flex gap-2">
        <Input
          bind:value={inputValue}
          onkeydown={handleKeyPress}
          placeholder="Type your message..."
          disabled={!user}
          class="flex-1"
        />
        <Button
          onclick={sendMessage}
          disabled={!user || !inputValue.trim()}
          size="icon"
        >
          <Send class="size-4"/>
        </Button>
      </div>
    </div>
  </div>
  {/if}
</div>
