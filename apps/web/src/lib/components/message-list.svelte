<script lang="ts">
  import MessageBubble from "./message-bubble.svelte";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";

  type Message = {
    id: string;
    content: string;
    role: "user" | "assistant";
    timestamp: Date;
  };

  let {
    messages,
    messagesContainer = $bindable(undefined),
  }: {
    messages: Message[];
    messagesContainer?: HTMLDivElement | undefined;
  } = $props();
</script>

<div
  bind:this={messagesContainer}
  class="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8"
>
  <div class="container mx-auto max-w-4xl space-y-4">
    {#if messages.length === 0}
    <div
      class="flex h-full min-h-[400px] items-center justify-center py-12"
    >
      <Card class="w-full max-w-md shadow-md">
        <CardHeader class="text-center space-y-2 px-6 pt-6 pb-4">
          <CardTitle class="text-2xl font-semibold">
            Start a conversation
          </CardTitle>
          <CardDescription class="text-base">
            Type a message below to begin chatting
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
    {:else}
    {#each messages as message (message.id)}
    <MessageBubble {message} />
    {/each}
    {/if}
  </div>
</div>

