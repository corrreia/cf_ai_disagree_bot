<script lang="ts">import ChatInput from "@/components/chat-input.svelte";
import MessageList from "@/components/message-list.svelte";
import WelcomeCard from "@/components/welcome-card.svelte";
import { browser } from "$app/environment";
import { AudioHandler } from "$lib/audio-handler";
import { authClient } from "$lib/auth-client";
import Navbar from "$lib/components/navbar.svelte";
import { RealtimeClient } from "$lib/realtime-client";
import {
  handleWebSocketMessage,
  type Message,
  RECONNECT_DELAY_MS,
  type WebSocketMessageData,
} from "$lib/websocket-handler";
import type { PageData } from "./$types";

let { data = { user: undefined } }: { data?: PageData } = $props();

let user = $state(data?.user);
let voiceEnabled = $state(false);
let isRecording = $state(false);
let audioHandler: AudioHandler | null = null;
let realtimeClient: RealtimeClient | null = null;

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
let ws = $state<WebSocket | null>(null);
let isConnected = $state(false);
let isLoadingMessages = $state(false);

// Initialize audio handler and realtime client when voice is enabled
if (browser) {
  audioHandler = new AudioHandler();
  realtimeClient = new RealtimeClient();
}

function scrollToBottom() {
  setTimeout(() => {
    messagesContainer?.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: "smooth",
    });
  }, 0);
}

// Load previous messages when user is available
async function loadMessages() {
  if (!browser) {
    return;
  }
  if (!user) {
    return;
  }
  if (isLoadingMessages) {
    return;
  }

  try {
    isLoadingMessages = true;
    const response = await fetch("/api/chat/memory");
    if (!response.ok) {
      return;
    }

    const responseData = (await response.json()) as {
      memory?: Array<{
        id: string;
        content: string;
        role: "user" | "assistant";
        timestamp: number;
      }>;
    };

    if (responseData.memory && Array.isArray(responseData.memory)) {
      messages = responseData.memory.map((msg) => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        timestamp: new Date(msg.timestamp),
      }));
      scrollToBottom();
    }
  } catch (err) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error loading messages:", err);
  } finally {
    isLoadingMessages = false;
  }
}

// Clear all messages
async function clearChat() {
  if (!browser) {
    return;
  }
  if (!user) {
    return;
  }

  try {
    const response = await fetch("/api/chat/memory", {
      method: "DELETE",
    });

    if (response.ok) {
      messages = [];
    }
  } catch (err) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error clearing chat:", err);
  }
}

// Toggle voice mode
async function toggleVoice() {
  if (!(browser && user)) {
    return;
  }
  if (!(audioHandler && realtimeClient)) {
    return;
  }

  if (voiceEnabled) {
    // Disable voice mode
    await disableVoice();
  } else {
    // Enable voice mode
    await enableVoice();
  }
}

// Enable voice mode
async function enableVoice() {
  if (!(audioHandler && realtimeClient)) {
    return;
  }

  try {
    // Initialize audio
    await audioHandler.initialize();

    // Create WebSocket endpoints for adapters
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ingestEndpoint = `${protocol}//${window.location.host}/api/realtime/audio/ingest`;
    const streamEndpoint = `${protocol}//${window.location.host}/api/realtime/audio/stream`;

    // Create adapters
    const adapters = await realtimeClient.createAdapters(
      ingestEndpoint,
      streamEndpoint
    );

    // Connect to ingest WebSocket (client -> agent)
    realtimeClient.connectIngest(adapters.ingest.endpoint, () => {
      // Audio chunks are sent automatically via startStreaming
    });

    // Connect to stream WebSocket (agent -> client)
    realtimeClient.connectStream(adapters.stream.endpoint, async (chunk) => {
      // Play received audio
      if (audioHandler) {
        try {
          await audioHandler.playPCMAudio(chunk);
        } catch (error) {
          // biome-ignore lint: console.error is used for debugging
          console.error("Error playing audio:", error);
        }
      }
    });

    // Start streaming audio
    audioHandler.startStreaming((chunk) => {
      // Send audio chunk to ingest WebSocket
      if (realtimeClient) {
        realtimeClient.sendAudioChunk(chunk);
      }
    });

    voiceEnabled = true;
    isRecording = true;
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error enabling voice:", error);
    // biome-ignore lint: no-alert
    alert("Failed to enable voice mode. Please check microphone permissions.");
  }
}

// Disable voice mode
async function disableVoice() {
  if (!(audioHandler && realtimeClient)) {
    return;
  }

  try {
    // Stop streaming
    audioHandler.stopStreaming();

    // Cleanup
    await realtimeClient.cleanup();
    audioHandler.cleanup();

    voiceEnabled = false;
    isRecording = false;
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error disabling voice:", error);
  }
}

// Cleanup when component unmounts or user logs out
$effect(() => {
  if (!user && voiceEnabled) {
    disableVoice();
  }

  return () => {
    if (voiceEnabled) {
      disableVoice();
    }
  };
});

// Connect WebSocket when user is available
$effect(() => {
  if (browser && user && !ws) {
    loadMessages().then(() => {
      connectWebSocket();
    });
  } else if (!user && ws) {
    ws.close();
    ws = null;
    isConnected = false;
    messages = [];
  }
});

function connectWebSocket() {
  if (!user) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;

  try {
    const socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      isConnected = true;
    });

    socket.addEventListener("message", (event) => {
      try {
        const wsData = JSON.parse(event.data as string) as WebSocketMessageData;
        messages = handleWebSocketMessage({
          wsData,
          messages,
          setMessages: (newMessages) => {
            messages = newMessages;
          },
          setIsLoading: (loading) => {
            isLoading = loading;
          },
          scrollToBottom,
        });
      } catch (error) {
        // biome-ignore lint: console.error is used for debugging
        console.error("Error parsing WebSocket message:", error);
      }
    });

    socket.addEventListener("error", (wsError) => {
      // biome-ignore lint: console.error is used for debugging
      console.error("WebSocket error:", wsError);
      isConnected = false;
      isLoading = false;
    });

    socket.addEventListener("close", () => {
      isConnected = false;
      ws = null;
      // Attempt to reconnect after a delay if user is still logged in
      if (user) {
        setTimeout(() => {
          if (user && !ws) {
            connectWebSocket();
          }
        }, RECONNECT_DELAY_MS);
      }
    });

    ws = socket;
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error connecting WebSocket:", error);
    isConnected = false;
  }
}

function sendMessage() {
  const trimmedInput = inputValue.trim();
  if (!trimmedInput) {
    return;
  }
  if (isLoading) {
    // Prevent sending another message while waiting for response
    return;
  }
  if (!(user && ws) || ws.readyState !== WebSocket.OPEN) {
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
    // Send message with the same ID so backend can use it
    ws.send(
      JSON.stringify({
        type: "message",
        message: trimmedInput,
        messageId: userMessage.id,
      })
    );
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error sending message:", error);
    isLoading = false;
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      content:
        error instanceof Error
          ? error.message
          : "Failed to send message. Please try again.",
      role: "assistant",
      timestamp: new Date(),
    };
    messages = [...messages, errorMessage];
    scrollToBottom();
  }
}
</script>

<div class="flex h-screen flex-col">
  <Navbar
    user={user}
    onClearChat={clearChat}
    voiceEnabled={voiceEnabled}
    onVoiceToggle={toggleVoice}
  />

  {#if !user}
  <WelcomeCard/>
  {:else}
  <div class="flex flex-1 flex-col overflow-hidden">
    {#if voiceEnabled && isRecording}
    <div class="px-4 py-2 bg-primary/10 text-center text-sm">
      <span class="animate-pulse">●</span>Recording...
    </div>
    {/if}
    <MessageList {messages} bind:messagesContainer/>
    {#if !voiceEnabled}
    <ChatInput bind:inputValue {isLoading} {isConnected} onSend={sendMessage}/>
    {:else}
    <div
      class="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-2 py-3 sm:px-4 sm:py-4 md:px-6 lg:px-8"
    >
      <div class="container mx-auto max-w-4xl flex justify-center">
        <p class="text-sm text-muted-foreground">
          Voice mode active. Speak into your microphone.
        </p>
      </div>
    </div>
    {/if}
  </div>
  {/if}
</div>
