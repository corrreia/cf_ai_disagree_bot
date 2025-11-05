import type { RequestEvent } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
import { getChatAgent } from "$lib/server/agents/types";
import { auth } from "$lib/server/auth";

export const GET = async ({ request }: RequestEvent) => {
  try {
    const event = getRequestEvent();
    if (!event?.platform?.env) {
      return new Response("Platform environment not available", {
        status: 500,
      });
    }

    // Get authenticated user from session
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return new Response("Authentication required", { status: 401 });
    }

    const userId = session.user.id;

    // Check if this is a WebSocket upgrade request
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return new Response("ChatAgent binding not found", { status: 500 });
    }

    // Get agent instance using SDK's getAgentByName helper
    // This properly handles WebSocket connections with the SDK
    const agent = await getChatAgent(chatAgentNamespace, userId);

    // Forward the WebSocket request to the Agent
    // The SDK will handle the WebSocket upgrade and route to onConnect/onMessage
    return agent.fetch(request);
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error setting up WebSocket:", error);
    return new Response(
      `Failed to set up WebSocket: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    );
  }
};
