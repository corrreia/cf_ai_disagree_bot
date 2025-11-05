import { json } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import { auth } from "$lib/server/auth";
import type { RequestHandler } from "./$types";
import type { ChatAgentStub } from "$lib/server/agents/types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const event = getRequestEvent();
    if (!event?.platform?.env) {
      return json(
        { error: "Platform environment not available" },
        { status: 500 }
      );
    }

    // Get authenticated user from session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    const userId = session.user.id;

    const { message } = (await request.json()) as {
      message?: string;
    };

    if (!message || typeof message !== "string") {
      return json({ error: "Message is required" }, { status: 400 });
    }

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return json({ error: "ChatAgent binding not found" }, { status: 500 });
    }

    // Get or create an agent instance for this user
    // Using userId as the agent instance name ensures each user has their own agent
    const agentStub = chatAgentNamespace.getByName(userId) as ChatAgentStub;

    // Call the sendMessage RPC method on the agent via internal connection
    const result = await agentStub.sendMessage(message);

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
