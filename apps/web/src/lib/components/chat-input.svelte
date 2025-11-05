<script lang="ts">import { Send } from "lucide-svelte";
import { browser } from "$app/environment";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";

let {
  inputValue = $bindable(""),
  isLoading,
  isConnected,
  onSend,
}: {
  inputValue?: string;
  isLoading: boolean;
  isConnected: boolean;
  onSend: () => void;
} = $props();

let inputRef = $state<HTMLInputElement | null>(null);
let previousIsLoading = $state(isLoading);

// Focus input when it becomes available after bot finishes writing
$effect(() => {
  if (browser && inputRef && previousIsLoading && !isLoading && isConnected) {
    // Small delay to ensure the input is fully enabled
    setTimeout(() => {
      inputRef?.focus();
    }, 0);
  }
  previousIsLoading = isLoading;
});

function handleKeyPress(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    onSend();
  }
}
</script>

<div
  class="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-2 py-3 sm:px-4 sm:py-4 md:px-6 lg:px-8"
>
  <div class="container mx-auto max-w-4xl flex gap-2 sm:gap-3">
    <Input
      bind:ref={inputRef}
      bind:value={inputValue}
      onkeydown={handleKeyPress}
      placeholder="Type your message..."
      disabled={isLoading || !isConnected}
      class="flex-1 text-sm sm:text-base"
    />
    <Button
      onclick={onSend}
      disabled={!inputValue.trim() || isLoading || !isConnected}
      size="icon"
      title={!isConnected ? "Connecting..." : ""}
      class="shrink-0"
    >
      <Send class="size-4 sm:size-5"/>
      <span class="sr-only">Send message</span>
    </Button>
  </div>
</div>
