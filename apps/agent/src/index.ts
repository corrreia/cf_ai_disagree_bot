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

export class ChatAgent extends Agent<Record<string, never>, AgentState> {
  initialState: AgentState = {
    memory: [],
  };

  onStart() {
    // Agent started - memory is available via this.state.memory
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

    // Simple response: echo the user's message
    // In the future, this can use MCP to search Cloudflare docs
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      content: userMessage, // Echo back for now
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
