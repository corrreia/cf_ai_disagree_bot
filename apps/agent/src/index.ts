/// <reference path="./worker-configuration.d.ts" />
import { Agent, type Connection, type ConnectionContext } from "agents";

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
  // Initial state - SDK automatically persists and loads this
  initialState: AgentState = {
    memory: [],
  };

  async onStart() {
    // Agent started - state is automatically loaded by SDK
    // No database setup needed, setState() handles persistence automatically
  }

  // Handle WebSocket connections - SDK automatically handles the upgrade
  // Called when a client establishes a WebSocket connection
  async onConnect(
    _connection: Connection,
    _ctx: ConnectionContext
  ): Promise<void> {
    // Connections are automatically accepted by the SDK
    // Access the original request via ctx.request for auth, headers, etc.
    // You can explicitly close a connection here with connection.close() if needed
  }

  // Handle WebSocket messages - SDK automatically routes messages here
  // Called for each incoming WebSocket message
  async onMessage(
    connection: Connection,
    message: string | ArrayBuffer | ArrayBufferView
  ): Promise<void> {
    try {
      const messageStr =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      const data = JSON.parse(messageStr) as {
        type: string;
        message?: string;
        messageId?: string;
      };

      if (data.type === "message" && data.message) {
        await this.handleWebSocketMessage(
          connection,
          data.message,
          data.messageId
        );
      }
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error handling WebSocket message:", error);
      connection.send(
        JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  }

  // Handle WebSocket errors
  // Note: SDK may call this with just error or with connection+error
  onError(connectionOrError: Connection | unknown, error?: unknown): void {
    if (
      error !== undefined &&
      typeof connectionOrError === "object" &&
      connectionOrError !== null &&
      "id" in connectionOrError
    ) {
      // Called with (connection, error)
      const connection = connectionOrError as Connection;
      // biome-ignore lint: console.error is used for debugging
      console.error(`WebSocket connection error (${connection.id}):`, error);
    } else {
      // Called with just (error)
      // biome-ignore lint: console.error is used for debugging
      console.error("WebSocket error:", connectionOrError);
    }
  }

  // Handle WebSocket close events
  async onClose(
    _connection: Connection,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    // WebSocket closed - no action needed
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

  // Send a streaming chunk via WebSocket connection
  private sendChunk(
    connection: Connection,
    messageId: string,
    chunk: string
  ): void {
    connection.send(
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
    connection: Connection,
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
        this.sendChunk(connection, messageId, textChunk);
      }
      // Skip logging for expected empty lines (metadata, empty responses, [DONE], etc.)
    }
    return fullResponse;
  }

  // Process the AI streaming response and send chunks via WebSocket connection
  private async processAIStream(
    stream: ReadableStream,
    connection: Connection,
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
          connection,
          messageId,
          fullResponse
        );
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const textChunk = this.processStreamLine(buffer);
        if (textChunk) {
          fullResponse += textChunk;
          this.sendChunk(connection, messageId, textChunk);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  }

  // Handle WebSocket message and send AI response
  private async handleWebSocketMessage(
    connection: Connection,
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

    // setState automatically persists to database and syncs to clients
    this.setState({ memory: [...this.state.memory, userMsg] });
    const updatedMemory = this.state.memory;

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
      connection.send(
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
        connection,
        assistantMessageId
      );

      // Create final assistant message
      const assistantMessage: Message = {
        id: assistantMessageId,
        content: fullResponse,
        role: "assistant",
        timestamp: Date.now(),
      };

      // setState automatically persists to database and syncs to clients
      this.setState({ memory: [...updatedMemory, assistantMessage] });

      // Send completion message
      connection.send(
        JSON.stringify({
          type: "assistant_message_complete",
          message: assistantMessage,
        })
      );
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error calling AI:", error);
      connection.send(
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

    // setState automatically persists to database and syncs to clients
    this.setState({ memory: [...this.state.memory, userMsg] });
    const updatedMemory = this.state.memory;

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

      // setState automatically persists to database and syncs to clients
      this.setState({ memory: [...updatedMemory, assistantMessage] });
      const finalMemory = this.state.memory;

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
  // State is automatically persisted, just return it
  getMemory(): Message[] {
    return this.state.memory;
  }

  // Method to clear memory
  clearMemory(): void {
    // setState automatically persists to database and syncs to clients
    this.setState({ memory: [] });
  }

  // Called when the Agent's state is updated from any source
  // source can be "server" or a client Connection
  onStateUpdate(_state: AgentState, _source: "server" | Connection): void {
    // React to state changes - useful for logging, metrics, or validation
    // This is called automatically whenever setState() is called
  }
}

export default {
  fetch: () => new Response("Agent worker is running", { status: 200 }),
};
