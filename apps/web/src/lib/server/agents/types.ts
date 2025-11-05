// Type definitions for ChatAgent RPC methods
// These types match the ChatAgent class in apps/agent/src/index.ts

export type Message = {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: number;
};

export type ChatAgentStub = DurableObjectStub & {
  getMemory: () => Promise<Message[]>;
  clearMemory: () => Promise<void>;
  sendMessage: (
    msg: string
  ) => Promise<{ response: string; memory: Message[] }>;
};
