/// <reference path="./worker-configuration.d.ts" />
import { Agent } from "agents";
import { RealtimeAdapterHandler } from "./realtime-handler";

const SSE_DATA_PREFIX_LENGTH = 6; // Length of "data: "

type Message = {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: number;
};

type AgentState = {
  memory: Message[];
};

// Env type is defined in worker-configuration.d.ts and includes AI binding
// Using Cloudflare.Env which has AI: Ai defined
type Env = Cloudflare.Env;

export class ChatAgent extends Agent<Env, AgentState> {
  initialState: AgentState = {
    memory: [],
  };

  private realtimeHandler: RealtimeAdapterHandler | null = null;
  private readonly audioWsConnections: Map<
    WebSocket,
    { type: "ingest" | "stream" }
  > = new Map();

  async onStart() {
    // Agent started - memory is available via this.state.memory
    // Load state from storage if it exists (for hibernation compatibility)
    const storedState = await this.ctx.storage.get<AgentState>("state");
    if (storedState) {
      (this.state as AgentState).memory = storedState.memory || [];
    }

    // Initialize Realtime handler
    this.realtimeHandler = new RealtimeAdapterHandler(this.env);
  }

  // Handle WebSocket connections using Native Durable Object WebSocket API for hibernation
  // biome-ignore lint/suspicious/useAwait: this is a DO method
  async fetch(request: Request): Promise<Response> {
    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      // biome-ignore lint/correctness/noUndeclaredVariables: WebSocketPair is a global provided by Cloudflare Workers runtime
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      // Accept the server WebSocket connection using the hibernation API
      // This allows the Durable Object to hibernate without disconnecting clients
      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit);
    }

    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  // Handle WebSocket messages using the hibernation API
  // This method is called automatically when a message is received during hibernation
  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    try {
      // Check if this is an audio WebSocket connection
      const audioConn = this.audioWsConnections.get(ws);
      if (audioConn) {
        await this.handleAudioWebSocketMessage(ws, message, audioConn.type);
        return;
      }

      // Handle text messages
      const messageStr =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      const data = JSON.parse(messageStr) as {
        type: string;
        message?: string;
        messageId?: string;
        adapterType?: "ingest" | "stream";
      };

      if (data.type === "message" && data.message) {
        await this.handleWebSocketMessage(ws, data.message, data.messageId);
      } else if (data.type === "audio_connection" && data.adapterType) {
        // Register audio WebSocket connection
        this.audioWsConnections.set(ws, { type: data.adapterType });
      }
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error handling WebSocket message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  }

  // Handle audio WebSocket messages (PCM audio chunks)
  private handleAudioWebSocketMessage(
    _ws: WebSocket,
    message: string | ArrayBuffer,
    type: "ingest" | "stream"
  ): void {
    if (!this.realtimeHandler) {
      return;
    }

    if (type === "ingest") {
      // Receive audio from client, accumulate and transcribe
      let audioData: Uint8Array;
      if (message instanceof ArrayBuffer) {
        audioData = new Uint8Array(message);
      } else {
        // Convert string to Uint8Array (assuming it's already binary data)
        const str =
          typeof message === "string"
            ? message
            : new TextDecoder().decode(message);
        audioData = new Uint8Array(str.length);
        let i = 0;
        while (i < str.length) {
          audioData[i] = str.charCodeAt(i);
          i += 1;
        }
      }

      this.realtimeHandler.addAudioChunk(audioData);

      // Periodically transcribe (you might want to adjust this logic)
      // For now, we'll transcribe when explicitly requested via a control message
    } else if (type === "stream") {
      // This shouldn't happen - stream adapter sends TO the client
      // biome-ignore lint: console.error is used for debugging
      console.warn("Received message on stream WebSocket");
    }
  }

  // Handle WebSocket close using the hibernation API
  webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    // Clean up audio WebSocket connection
    this.audioWsConnections.delete(ws);
    return Promise.resolve();
  }

  // Create Realtime SFU adapters for voice communication
  async createRealtimeAdapters(
    ingestEndpoint: string,
    streamEndpoint: string
  ): Promise<{ ingest: unknown; stream: unknown }> {
    if (!this.realtimeHandler) {
      throw new Error("Realtime handler not initialized");
    }

    const ingestTrackName = `audio-ingest-${crypto.randomUUID()}`;
    const streamTrackName = `audio-stream-${crypto.randomUUID()}`;

    // Create ingest adapter
    const ingestAdapter = await this.realtimeHandler.createIngestAdapter(
      ingestEndpoint,
      ingestTrackName
    );

    // Create stream adapter using the same session ID
    const streamAdapter = await this.realtimeHandler.createStreamAdapter(
      ingestAdapter.sessionId,
      streamTrackName,
      streamEndpoint
    );

    return {
      ingest: ingestAdapter,
      stream: streamAdapter,
    };
  }

  // Process transcribed text and generate audio response
  async processVoiceMessage(
    transcribedText: string,
    streamWs: WebSocket
  ): Promise<void> {
    if (!this.realtimeHandler) {
      throw new Error("Realtime handler not initialized");
    }

    // Process text message (add to memory and get AI response)
    const userMsg: Message = {
      id: crypto.randomUUID(),
      content: transcribedText,
      role: "user",
      timestamp: Date.now(),
    };

    const updatedMemory = [...this.state.memory, userMsg];
    await this.ctx.storage.put("state", { memory: updatedMemory });
    (this.state as AgentState).memory = updatedMemory;

    // Get system instructions
    const systemInstructions =
      (this.env.SYSTEM_INSTRUCTIONS as string | undefined) || "";
    const chatMessages = [
      ...(systemInstructions
        ? [
            {
              role: "system" as const,
              content: systemInstructions,
            },
          ]
        : []),
      ...updatedMemory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    try {
      // Call AI to generate response
      const aiResponse = (await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: chatMessages,
        }
      )) as { response: string };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: aiResponse.response,
        role: "assistant",
        timestamp: Date.now(),
      };

      const finalMemory = [...updatedMemory, assistantMessage];
      await this.ctx.storage.put("state", { memory: finalMemory });
      (this.state as AgentState).memory = finalMemory;

      // Synthesize response to audio and stream
      await this.realtimeHandler.synthesizeAndStream(
        aiResponse.response,
        streamWs
      );
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error processing voice message:", error);
      throw error;
    }
  }

  // Transcribe accumulated audio and process
  async transcribeAndRespond(streamWs: WebSocket): Promise<void> {
    if (!this.realtimeHandler) {
      throw new Error("Realtime handler not initialized");
    }

    const transcribedText = await this.realtimeHandler.transcribe();
    if (transcribedText.trim()) {
      await this.processVoiceMessage(transcribedText, streamWs);
    }
  }

  // Cleanup Realtime adapters
  async cleanupRealtime(): Promise<void> {
    if (this.realtimeHandler) {
      await this.realtimeHandler.cleanup();
    }
    this.audioWsConnections.clear();
  }

  // Extract text from OpenAI format (choices[0].delta.content)
  private extractOpenAIChunk(obj: Record<string, unknown>): string {
    if (!Array.isArray(obj.choices) || obj.choices.length === 0) {
      return "";
    }
    const choice = obj.choices[0] as Record<string, unknown>;
    if (typeof choice.delta !== "object" || !choice.delta) {
      return "";
    }
    const delta = choice.delta as Record<string, unknown>;
    if (typeof delta.content === "string") {
      return delta.content;
    }
    return "";
  }

  // Extract text chunk from parsed AI response data
  private extractTextChunk(data: unknown): string {
    if (typeof data !== "object" || data === null) {
      return "";
    }

    const obj = data as Record<string, unknown>;

    // Try OpenAI format first
    const openAIChunk = this.extractOpenAIChunk(obj);
    if (openAIChunk) {
      return openAIChunk;
    }

    // Check response field explicitly (Workers AI format)
    // Must check undefined separately since empty string is falsy
    if (obj.response !== undefined && typeof obj.response === "string") {
      return obj.response;
    }

    // Fallback to other possible fields
    if (obj.text !== undefined && typeof obj.text === "string") {
      return obj.text;
    }
    if (obj.content !== undefined && typeof obj.content === "string") {
      return obj.content;
    }

    return "";
  }

  // Send a streaming chunk via WebSocket
  private sendChunk(ws: WebSocket, messageId: string, chunk: string): void {
    ws.send(
      JSON.stringify({
        type: "assistant_message_chunk",
        messageId,
        chunk,
      })
    );
  }

  // Process a single line from the stream and extract text chunk
  private processStreamLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return "";
    }

    // Handle SSE format: data: {...}
    if (trimmed.startsWith("data: ")) {
      // Skip [DONE] marker (data: [DONE])
      if (trimmed === "data: [DONE]") {
        return "";
      }

      try {
        // Skip "data: " prefix to get the JSON string
        const jsonStr = trimmed.slice(SSE_DATA_PREFIX_LENGTH);
        const data = JSON.parse(jsonStr);
        return this.extractTextChunk(data);
      } catch {
        // Silently ignore parse errors for [DONE] and other expected markers
        return "";
      }
    }

    // Try parsing as direct JSON (non-SSE format)
    if (trimmed.startsWith("{")) {
      try {
        const data = JSON.parse(trimmed);
        return this.extractTextChunk(data);
      } catch {
        return "";
      }
    }

    return "";
  }

  // Process lines from the stream buffer
  private processStreamLines(
    lines: string[],
    ws: WebSocket,
    messageId: string,
    currentResponse: string
  ): string {
    let fullResponse = currentResponse;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "[DONE]") {
        continue;
      }

      const textChunk = this.processStreamLine(line);
      if (textChunk) {
        fullResponse += textChunk;
        this.sendChunk(ws, messageId, textChunk);
      }
      // Skip logging for expected empty lines (metadata, empty responses, [DONE], etc.)
    }
    return fullResponse;
  }

  // Process the AI streaming response and send chunks via WebSocket
  private async processAIStream(
    stream: ReadableStream,
    ws: WebSocket,
    messageId: string
  ): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Split by newlines to process complete lines
        const lines = buffer.split("\n");
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || "";

        fullResponse = this.processStreamLines(
          lines,
          ws,
          messageId,
          fullResponse
        );
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const textChunk = this.processStreamLine(buffer);
        if (textChunk) {
          fullResponse += textChunk;
          this.sendChunk(ws, messageId, textChunk);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  }

  // Handle WebSocket message and send AI response
  private async handleWebSocketMessage(
    ws: WebSocket,
    userMessage: string,
    messageId?: string
  ): Promise<void> {
    // Add user message to memory
    const userMsg: Message = {
      id: messageId || crypto.randomUUID(),
      content: userMessage,
      role: "user",
      timestamp: Date.now(),
    };

    const updatedMemory = [...this.state.memory, userMsg];
    // Update state directly via storage to avoid Agent's WebSocket broadcast
    // which expects Partyserver-managed WebSockets
    await this.ctx.storage.put("state", { memory: updatedMemory });
    // Update local state reference
    (this.state as AgentState).memory = updatedMemory;

    // Prepare messages for AI (convert to chat format)
    // Get system instructions from environment variable
    const systemInstructions =
      (this.env.SYSTEM_INSTRUCTIONS as string | undefined) || "";
    const chatMessages = [
      ...(systemInstructions
        ? [
            {
              role: "system" as const,
              content: systemInstructions,
            },
          ]
        : []),
      ...updatedMemory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    try {
      const assistantMessageId = crypto.randomUUID();

      // Send start of streaming indicator
      ws.send(
        JSON.stringify({
          type: "assistant_message_start",
          messageId: assistantMessageId,
        })
      );

      // Call Cloudflare Workers AI with streaming enabled
      const stream = (await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: chatMessages,
          stream: true,
        }
      )) as ReadableStream;

      // Process stream and collect full response
      const fullResponse = await this.processAIStream(
        stream,
        ws,
        assistantMessageId
      );

      // Create final assistant message
      const assistantMessage: Message = {
        id: assistantMessageId,
        content: fullResponse,
        role: "assistant",
        timestamp: Date.now(),
      };

      // Add assistant response to memory
      const finalMemory = [...updatedMemory, assistantMessage];
      // Update state directly via storage to avoid Agent's WebSocket broadcast
      await this.ctx.storage.put("state", { memory: finalMemory });
      // Update local state reference
      (this.state as AgentState).memory = finalMemory;

      // Send completion message
      ws.send(
        JSON.stringify({
          type: "assistant_message_complete",
          message: assistantMessage,
        })
      );
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error calling AI:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "Failed to get AI response",
        })
      );
    }
  }

  // Custom RPC method to send a message and get a response
  // This is called via internal connection from the Worker
  async sendMessage(
    userMessage: string
  ): Promise<{ response: string; memory: Message[] }> {
    // Add user message to memory
    const userMsg: Message = {
      id: crypto.randomUUID(),
      content: userMessage,
      role: "user",
      timestamp: Date.now(),
    };

    // Update state with new message
    const updatedMemory = [...this.state.memory, userMsg];
    // Update state directly via storage to avoid Agent's WebSocket broadcast
    await this.ctx.storage.put("state", { memory: updatedMemory });
    (this.state as AgentState).memory = updatedMemory;

    // Prepare messages for AI (convert to chat format)
    // Get system instructions from environment variable
    const systemInstructions =
      (this.env.SYSTEM_INSTRUCTIONS as string | undefined) || "";
    const chatMessages = [
      ...(systemInstructions
        ? [
            {
              role: "system" as const,
              content: systemInstructions,
            },
          ]
        : []),
      ...updatedMemory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    // Call Cloudflare Workers AI
    try {
      const aiResponse = (await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: chatMessages,
        }
      )) as { response: string };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: aiResponse.response,
        role: "assistant",
        timestamp: Date.now(),
      };

      // Add assistant response to memory
      const finalMemory = [...updatedMemory, assistantMessage];
      // Update state directly via storage to avoid Agent's WebSocket broadcast
      await this.ctx.storage.put("state", { memory: finalMemory });
      (this.state as AgentState).memory = finalMemory;

      return {
        response: assistantMessage.content,
        memory: finalMemory,
      };
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error calling AI:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to get AI response"
      );
    }
  }

  // Method to get conversation history
  getMemory(): Promise<Message[]> {
    return Promise.resolve(this.state.memory);
  }

  // Method to clear memory
  async clearMemory(): Promise<void> {
    // Update state directly via storage to avoid Agent's WebSocket broadcast
    await this.ctx.storage.put("state", { memory: [] });
    (this.state as AgentState).memory = [];
  }
}

export default {
  fetch: () => new Response("Agent worker is running", { status: 200 }),
};
