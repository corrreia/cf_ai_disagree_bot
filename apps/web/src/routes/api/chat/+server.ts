import { json } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import { getChatAgent } from "$lib/server/agents/types";
import { auth } from "$lib/server/auth";
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

    // Get agent instance using SDK's getAgentByName helper
    const agent = await getChatAgent(chatAgentNamespace, userId);

    // Call methods directly - types are properly inferred from ChatAgentStub
    const result = await agent.sendMessage(message);

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
