export type Message = {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
};

export type WebSocketMessageData = {
  type: string;
  message?: Message & { timestamp: number };
  messageId?: string;
  chunk?: string;
  error?: string;
};

const RECONNECT_DELAY_MS = 3000;

export function handleWebSocketMessage(options: {
  wsData: WebSocketMessageData;
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  setIsLoading: (loading: boolean) => void;
  scrollToBottom: () => void;
}): Message[] {
  const { wsData, messages, setIsLoading, scrollToBottom } = options;
  const updatedMessages = [...messages];

  if (wsData.type === "assistant_message_start" && wsData.messageId) {
    // Keep isLoading true - don't set to false here, wait for complete message
    const assistantMessage: Message = {
      id: wsData.messageId,
      content: "",
      role: "assistant",
      timestamp: new Date(),
    };
    updatedMessages.push(assistantMessage);
    scrollToBottom();
  } else if (
    wsData.type === "assistant_message_chunk" &&
    wsData.messageId &&
    wsData.chunk
  ) {
    const messageIndex = updatedMessages.findIndex(
      (m) => m.id === wsData.messageId
    );
    if (messageIndex >= 0) {
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: updatedMessages[messageIndex].content + wsData.chunk,
      };
      scrollToBottom();
    }
  } else if (wsData.type === "assistant_message_complete" && wsData.message) {
    // Message is complete, set loading to false
    setIsLoading(false);
    const message = wsData.message;
    const messageIndex = updatedMessages.findIndex((m) => m.id === message.id);
    const assistantMessage: Message = {
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: new Date(message.timestamp),
    };
    if (messageIndex >= 0) {
      updatedMessages[messageIndex] = assistantMessage;
    } else {
      updatedMessages.push(assistantMessage);
    }
    scrollToBottom();
  } else if (wsData.type === "error") {
    setIsLoading(false);
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      content: wsData.error || "An error occurred",
      role: "assistant",
      timestamp: new Date(),
    };
    updatedMessages.push(errorMessage);
    scrollToBottom();
  }

  return updatedMessages;
}

export { RECONNECT_DELAY_MS };
