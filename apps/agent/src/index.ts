/// <reference path="./worker-configuration.d.ts" />
import { Agent } from "agents";

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

  onStart() {
    // Agent started - memory is available via this.state.memory
  }

  // Handle WebSocket connections
  async fetch(request: Request): Promise<Response> {
    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      
      // Accept the server WebSocket connection
      (server as any).accept();
      
      // Handle WebSocket messages
      server.addEventListener("message", async (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            message?: string;
            messageId?: string;
            userId?: string;
          };

          if (data.type === "message" && data.message) {
            await this.handleWebSocketMessage(server, data.message, data.messageId);
          }
        } catch (error) {
          // biome-ignore lint: console.error is used for debugging
          console.error("Error handling WebSocket message:", error);
          server.send(JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          }));
        }
      });

      // Handle WebSocket close
      server.addEventListener("close", () => {
        // biome-ignore lint: console.log is used for debugging
        console.log("WebSocket closed");
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit);
    }

    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  // Handle WebSocket message and send AI response
  private async handleWebSocketMessage(ws: WebSocket, userMessage: string, messageId?: string): Promise<void> {
    // Add user message to memory
    const userMsg: Message = {
      id: messageId || crypto.randomUUID(),
      content: userMessage,
      role: "user",
      timestamp: Date.now(),
    };

    // Update state with new message
    const updatedMemory = [...this.state.memory, userMsg];
    this.setState({
      memory: updatedMemory,
    });

    // Prepare messages for AI (convert to chat format)
    const chatMessages = updatedMemory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Call Cloudflare Workers AI with streaming enabled
    try {
      const assistantMessageId = crypto.randomUUID();
      let fullResponse = "";

      // Send start of streaming indicator
      ws.send(JSON.stringify({
        type: "assistant_message_start",
        messageId: assistantMessageId,
      }));

      const stream = await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: chatMessages,
          stream: true,
        }
      ) as ReadableStream;

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Parse SSE format (data: {...}\n)
          const lines = buffer.split("\n");
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.trim() === "") continue;
            
            // Handle SSE format: data: {...}
            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6);
                const data = JSON.parse(jsonStr);
                
                // Handle different response formats
                const textChunk = data.response || data.text || data.content || "";
                if (textChunk) {
                  fullResponse += textChunk;
                  
                  // Send streaming chunk via WebSocket
                  ws.send(JSON.stringify({
                    type: "assistant_message_chunk",
                    messageId: assistantMessageId,
                    chunk: textChunk,
                  }));
                }
              } catch (e) {
                // Skip invalid JSON lines - might be partial data
                // biome-ignore lint: console.debug is used for debugging
                console.debug("Skipping invalid JSON line:", line);
              }
            } else if (line.trim().startsWith("{")) {
              // Try parsing as direct JSON (non-SSE format)
              try {
                const data = JSON.parse(line);
                const textChunk = data.response || data.text || data.content || "";
                if (textChunk) {
                  fullResponse += textChunk;
                  
                  ws.send(JSON.stringify({
                    type: "assistant_message_chunk",
                    messageId: assistantMessageId,
                    chunk: textChunk,
                  }));
                }
              } catch (e) {
                // Skip if not valid JSON
              }
            }
          }
        }
        
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            const textChunk = data.response || data.text || data.content || "";
            if (textChunk) {
              fullResponse += textChunk;
              ws.send(JSON.stringify({
                type: "assistant_message_chunk",
                messageId: assistantMessageId,
                chunk: textChunk,
              }));
            }
          } catch (e) {
            // Last chunk might be incomplete, ignore
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Create final assistant message
      const assistantMessage: Message = {
        id: assistantMessageId,
        content: fullResponse,
        role: "assistant",
        timestamp: Date.now(),
      };

      // Add assistant response to memory
      const finalMemory = [...updatedMemory, assistantMessage];
      this.setState({
        memory: finalMemory,
      });

      // Send completion message
      ws.send(JSON.stringify({
        type: "assistant_message_complete",
        message: assistantMessage,
      }));
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error calling AI:", error);
      ws.send(JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : "Failed to get AI response",
      }));
    }
  }

  // Custom RPC method to send a message and get a response
  // This is called via internal connection from the Worker
  // biome-ignore lint: RPC methods are typically async for consistency
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
    this.setState({
      memory: updatedMemory,
    });

    // Prepare messages for AI (convert to chat format)
    const chatMessages = updatedMemory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Call Cloudflare Workers AI
    try {
      const aiResponse = await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: chatMessages,
        }
      ) as { response: string };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        content: aiResponse.response,
        role: "assistant",
        timestamp: Date.now(),
      };

      // Add assistant response to memory
      const finalMemory = [...updatedMemory, assistantMessage];
      this.setState({
        memory: finalMemory,
      });

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
  clearMemory(): Promise<void> {
    this.setState({
      memory: [],
    });
    return Promise.resolve();
  }
}

export default {
  fetch: () => new Response("Agent worker is running", { status: 200 }),
};
