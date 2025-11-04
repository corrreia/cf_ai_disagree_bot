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

  const isEmpty = $derived(message.content.trim() === "");
  const isStreaming = $derived(message.role === "assistant" && isEmpty);
  let showTimestamp = $state(false);
  let touchStartTime = $state(0);
  let touchHandled = $state(false);

  const TAP_THRESHOLD_MS = 300; // Maximum duration for a tap (vs long press)
  const CLICK_PREVENTION_TIMEOUT_MS = 300; // Timeout to prevent click after touch

  function formatTimestamp(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    if (messageDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function handleTouchStart() {
    touchStartTime = Date.now();
    touchHandled = false;
  }

  function handleTouchEnd() {
    const touchDuration = Date.now() - touchStartTime;
    // Quick tap on mobile toggles timestamp (not a long press)
    if (touchDuration < TAP_THRESHOLD_MS) {
      showTimestamp = !showTimestamp;
      touchHandled = true;
      // Prevent click event from firing after touch
      setTimeout(() => {
        touchHandled = false;
      }, CLICK_PREVENTION_TIMEOUT_MS);
    }
  }
</script>

<div
  class="group flex gap-2 md:gap-4 {message.role === 'user'
      ? 'justify-end'
      : 'justify-start'}"
>
  {#if message.role === "user"}
  <div
    class="flex items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-[.show-timestamp]:opacity-100"
    class:opacity-100={showTimestamp}
  >
    <span class="text-xs text-muted-foreground whitespace-nowrap pr-2">
      {formatTimestamp(message.timestamp)}
    </span>
  </div>
  {/if}

  <Card
    class="max-w-[85%] sm:max-w-[80%] md:max-w-[75%] shadow-sm py-0 {message.role === 'user'
        ? 'bg-muted'
        : ''}"
    ontouchstart={handleTouchStart}
    ontouchend={handleTouchEnd}
    onclick={() => {
      // Prevent double-trigger: if touch event already handled it, skip click
      if (!touchHandled) {
        showTimestamp = !showTimestamp;
      }
    }}
    role="button"
    tabindex={0}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showTimestamp = !showTimestamp;
      }
    }}
  >
    <CardContent class="p-3 sm:p-4 md:p-5">
      {#if isStreaming}
      <div class="flex items-center gap-2 text-muted-foreground">
        <Loader2 class="size-4 animate-spin" />
        <span class="text-sm">Thinking...</span>
      </div>
      {:else}
      <p
        class="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere"
      >
        {message.content}
      </p>
      {/if}
    </CardContent>
  </Card>

  {#if message.role === "assistant"}
  <div
    class="flex items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-[.show-timestamp]:opacity-100"
    class:opacity-100={showTimestamp}
  >
    <span class="text-xs text-muted-foreground whitespace-nowrap pl-2">
      {formatTimestamp(message.timestamp)}
    </span>
  </div>
  {/if}
</div>

