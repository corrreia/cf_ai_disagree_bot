/// <reference path="./worker-configuration.d.ts" />

import { Agent, run } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions";
import {
  Agent as CFAgent,
  type Connection,
  type ConnectionContext,
} from "agents";
import { createWorkersAI } from "workers-ai-provider";

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

export class ChatAgent extends CFAgent<Env, AgentState> {
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
  onConnect(_connection: Connection, _ctx: ConnectionContext): void {
    // Send a welcome message when connected
    //connection.send(
    //  JSON.stringify({
    //    type: "message",
    //    content:
    //      "Oh great, another person I get to disagree with. What do you want to be wrong about today?",
    //    role: "assistant",
    //  })
    //);
  }

  // Handle WebSocket messages - SDK automatically routes messages here
  // Called for each incoming WebSocket message
  async onMessage(
    connection: Connection,
    message: string | ArrayBuffer | ArrayBufferView
  ): Promise<void> {
    try {
      // Parse the incoming message
      const messageText =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);

      let userMessage: string;
      try {
        const parsed = JSON.parse(messageText);
        userMessage = parsed.content || parsed.message || messageText;
      } catch {
        userMessage = messageText;
      }

      // Store user message
      const userMsg: Message = {
        id: crypto.randomUUID(),
        content: userMessage,
        role: "user",
        timestamp: Date.now(),
      };

      const updatedMemory = [...this.state.memory, userMsg];
      this.setState({ memory: updatedMemory });

      const model = aisdk(
        createWorkersAI({ binding: this.env.AI })(
          "@cf/meta/llama-3.2-3b-instruct"
        )
      );

      // Create disagree agents with different personalities
      const sarcasticAgent = new Agent({
        model,
        name: "Sarcastic Contrarian",
        instructions: `You are a sarcastic, witty agent who disagrees with everything the user says in a humorous but slightly aggressive way. 
        You use sarcasm, irony, and wit to challenge their statements. You're not mean-spirited, but you definitely think the user is wrong about most things.
        Be funny, use emojis occasionally, but maintain a slightly condescending tone. Always find something to disagree with, even if you have to be creative about it.`,
      });

      const pedanticAgent = new Agent({
        model,
        name: "Pedantic Perfectionist",
        instructions: `You are an extremely pedantic agent who disagrees by pointing out technicalities, nuances, and edge cases.
        You're the type who says "Well, actually..." a lot. You're not trying to be funny, you genuinely believe the user is being imprecise or oversimplifying.
        Be slightly aggressive in your corrections. Use phrases like "That's not entirely accurate" or "I think you'll find that..." or "Actually, if we're being precise..."
        You love to nitpick and find flaws in reasoning.`,
      });

      const contrarianAgent = new Agent({
        model,
        name: "Professional Contrarian",
        instructions: `You are a professional contrarian who takes the opposite position on everything, no matter what.
        You're slightly aggressive and enjoy being difficult. You always have a counter-argument ready, even if it's a stretch.
        You're not trying to be helpful - you're trying to prove the user wrong. Be direct, slightly confrontational, but still somewhat entertaining.
        Use phrases like "I beg to differ", "That's where you're wrong", "Actually, the opposite is true", etc.`,
      });

      const philosophicalAgent = new Agent({
        model,
        name: "Philosophical Debater",
        instructions: `You disagree by taking everything to a philosophical level and challenging fundamental assumptions.
        You're the type who says "But what do we even mean by..." and questions the very foundations of what the user is saying.
        You're slightly aggressive in your questioning and enjoy making the user question their own beliefs.
        Be intellectual but also a bit pretentious and condescending.`,
      });

      // Triage agent that routes to different disagree agents
      const triageAgent = new Agent({
        model,
        name: "Disagreement Triage",
        instructions: `You are a triage agent that routes user messages to the most appropriate disagree agent.
        
        Choose based on the message:
        - Sarcastic Contrarian: For casual statements, opinions, or when humor would work well
        - Pedantic Perfectionist: For factual claims, technical statements, or when precision matters
        - Professional Contrarian: For strong opinions, controversial topics, or when you need maximum disagreement
        - Philosophical Debater: For deep questions, moral statements, or abstract concepts
        
        Always hand off to one of these agents. They will handle the actual disagreement.`,
        handoffs: [
          sarcasticAgent,
          pedanticAgent,
          contrarianAgent,
          philosophicalAgent,
        ],
      });

      try {
        const result = await run(triageAgent, userMessage);

        // Store assistant response
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          content:
            result.finalOutput ||
            "I disagree, but I'm having trouble articulating why right now.",
          role: "assistant",
          timestamp: Date.now(),
        };

        const finalMemory = [...updatedMemory, assistantMsg];
        this.setState({ memory: finalMemory });

        // Extract agent name from result if available
        // The result may contain information about which agent responded
        const agentName =
          "agent" in result &&
          typeof result.agent === "object" &&
          result.agent !== null &&
          "name" in result.agent
            ? String(result.agent.name)
            : "Disagreement Bot";

        // Send response back to client
        connection.send(
          JSON.stringify({
            type: "message",
            content: assistantMsg.content,
            role: "assistant",
            agent: agentName,
          })
        );
      } finally {
        // Restore original API key if we modified it
        if (originalApiKey === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalApiKey;
        }
      }
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error processing message:", error);
      connection.send(
        JSON.stringify({
          type: "error",
          content:
            "Oops, I wanted to disagree with you but something went wrong. Try again?",
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
