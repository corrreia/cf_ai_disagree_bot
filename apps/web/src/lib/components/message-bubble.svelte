<script lang="ts">
  import { Loader2 } from "lucide-svelte";
  import {
    Card,
    CardContent,
  } from "$lib/components/ui/card";

  type Message = {
    id: string;
    content: string;
    role: "user" | "assistant";
    timestamp: Date;
  };

  let { message }: { message: Message } = $props();

  const isEmpty = message.content.trim() === "";
  const isStreaming = message.role === "assistant" && isEmpty;
</script>

<div
  class="flex gap-4 {message.role === 'user'
      ? 'justify-end'
      : 'justify-start'}"
>
  <Card
    class="max-w-[85%] md:max-w-[75%] shadow-sm py-0 {message.role === 'user'
        ? 'bg-muted'
        : ''}"
  >
    <CardContent class="p-4 md:p-5">
      {#if isStreaming}
      <div class="flex items-center gap-2 text-muted-foreground">
        <Loader2 class="size-4 animate-spin" />
        <span class="text-sm">Thinking...</span>
      </div>
      {:else}
      <p
        class="text-sm md:text-base leading-relaxed whitespace-pre-wrap"
      >
        {message.content}
      </p>
      {/if}
      {#if !isStreaming}
      <p class="mt-3 text-xs text-muted-foreground">
        {new Date(message.timestamp).toLocaleTimeString()}
      </p>
      {/if}
    </CardContent>
  </Card>
</div>

