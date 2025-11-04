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

export function handleWebSocketMessage(
  wsData: WebSocketMessageData,
  messages: Message[],
  setMessages: (messages: Message[]) => void,
  setIsLoading: (loading: boolean) => void,
  scrollToBottom: () => void
): Message[] {
  const updatedMessages = [...messages];

  if (wsData.type === "assistant_message_start" && wsData.messageId) {
    setIsLoading(false);
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
    const messageIndex = updatedMessages.findIndex(
      (m) => m.id === wsData.message.id
    );
    const assistantMessage: Message = {
      id: wsData.message.id,
      content: wsData.message.content,
      role: wsData.message.role,
      timestamp: new Date(wsData.message.timestamp),
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

