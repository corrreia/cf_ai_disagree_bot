import type { RequestEvent } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
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

    // Get or create an agent instance for this user
    const agentStub = chatAgentNamespace.getByName(userId);

    // Forward the WebSocket request to the Durable Object
    // The agent will handle audio ingestion
    return agentStub.fetch(request);
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error setting up audio ingest WebSocket:", error);
    return new Response(
      `Failed to set up WebSocket: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500 }
    );
  }
};

