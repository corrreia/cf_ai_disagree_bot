import { json } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const event = getRequestEvent();
    if (!event?.platform?.env) {
      return json(
        { error: "Platform environment not available" },
        { status: 500 }
      );
    }

    const { message, userId } = (await request.json()) as {
      message?: string;
      userId?: string;
    };

    if (!message || typeof message !== "string") {
      return json({ error: "Message is required" }, { status: 400 });
    }

    if (!userId || typeof userId !== "string") {
      return json({ error: "User ID is required" }, { status: 400 });
    }

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return json({ error: "ChatAgent binding not found" }, { status: 500 });
    }

    // Get or create an agent instance for this user
    // Using userId as the agent instance name ensures each user has their own agent
    const agentStub = chatAgentNamespace.getByName(userId);

    // Call the sendMessage RPC method on the agent via internal connection
    const result = await (
      agentStub as unknown as {
        sendMessage: (
          msg: string
        ) => Promise<{ response: string; memory: unknown[] }>;
      }
    ).sendMessage(message);

    return json({
      response: result.response,
      memory: result.memory,
    });
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error calling agent:", error);
    return json(
      {
        error: "Failed to process message",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};
