import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import type { ChatAgentStub } from "$lib/server/agents/types";
import { auth } from "$lib/server/auth";

export const GET = async ({ request }: RequestEvent) => {
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

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return json({ error: "ChatAgent binding not found" }, { status: 500 });
    }

    // Get the agent instance for this user
    const agentStub = chatAgentNamespace.getByName(userId) as ChatAgentStub;

    // Call the getMemory RPC method on the agent
    const memory = await agentStub.getMemory();

    return json({ memory });
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error getting memory:", error);
    return json(
      {
        error: "Failed to get memory",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};

export const DELETE = async ({ request }: RequestEvent) => {
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

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return json({ error: "ChatAgent binding not found" }, { status: 500 });
    }

    // Get the agent instance for this user
    const agentStub = chatAgentNamespace.getByName(userId) as ChatAgentStub;

    // Call the clearMemory RPC method on the agent
    await agentStub.clearMemory();

    return json({ success: true });
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error clearing memory:", error);
    return json(
      {
        error: "Failed to clear memory",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};
