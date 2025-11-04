import { getRequestEvent } from "$app/server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, url }) => {
  try {
    const event = getRequestEvent();
    if (!event?.platform?.env) {
      return new Response("Platform environment not available", { status: 500 });
    }

    // Get userId from query params
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return new Response("User ID is required", { status: 400 });
    }

    // Check if this is a WebSocket upgrade request
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return new Response("ChatAgent binding not found", { status: 500 });
    }

    // Get or create an agent instance for this user
    // Using userId as the agent instance name ensures each user has their own agent
    const agentStub = chatAgentNamespace.getByName(userId);

    // Forward the WebSocket request to the Durable Object
    // The Durable Object's fetch method will handle the WebSocket upgrade
    return agentStub.fetch(request);
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error setting up WebSocket:", error);
    return new Response(
      `Failed to set up WebSocket: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    );
  }
};

