// Type definitions for ChatAgent RPC methods
// These types match the ChatAgent class in apps/agent/src/index.ts

// Use type-only imports to avoid bundling Cloudflare Workers-specific code during build
import type { Agent, AgentNamespace } from "agents";

export type Message = {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: number;
};

export type ChatAgentStub = DurableObjectStub & {
  // RPC calls are always async, even if the method is synchronous
  getMemory: () => Promise<Message[]>;
  clearMemory: () => Promise<void>;
  sendMessage: (
    msg: string
  ) => Promise<{ response: string; memory: Message[] }>;
};

/**
 * Helper function to get a ChatAgent instance using the SDK's getAgentByName.
 * This properly handles the type casting needed because the binding is typed
 * as DurableObjectNamespace but the SDK expects AgentNamespace.
 *
 * Uses dynamic import to avoid bundling Cloudflare Workers-specific code during build.
 */
export async function getChatAgent(
  namespace: DurableObjectNamespace,
  userId: string
): Promise<ChatAgentStub> {
  // Dynamic import loads at runtime in Cloudflare Workers environment
  const { getAgentByName } = await import("agents");
  const agent = await getAgentByName(
    namespace as unknown as AgentNamespace<Agent>,
    userId
  );
  return agent as unknown as ChatAgentStub;
}
