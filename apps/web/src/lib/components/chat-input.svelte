<script lang="ts">
  import { Send } from "lucide-svelte";
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

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }
</script>

<div
  class="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-4 md:px-6 lg:px-8"
>
  <div class="container mx-auto max-w-4xl flex gap-3">
    <Input
      bind:value={inputValue}
      onkeydown={handleKeyPress}
      placeholder="Type your message..."
      disabled={isLoading || !isConnected}
      class="flex-1"
    />
    <Button
      onclick={onSend}
      disabled={!inputValue.trim() || isLoading || !isConnected}
      size="icon"
      title={!isConnected ? "Connecting..." : ""}
    >
      <Send class="size-4"/>
    </Button>
  </div>
</div>

