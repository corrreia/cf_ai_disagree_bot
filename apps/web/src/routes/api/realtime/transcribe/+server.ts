import { json } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";
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

    const { streamEndpoint } = (await request.json()) as {
      streamEndpoint?: string;
    };

    if (!streamEndpoint) {
      return json({ error: "streamEndpoint is required" }, { status: 400 });
    }

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return json({ error: "ChatAgent binding not found" }, { status: 500 });
    }

    // Get or create an agent instance for this user
    const agentStub = chatAgentNamespace.getByName(userId);

    // Create a WebSocket connection to the stream endpoint
    // This is a simplified approach - in production, you'd need to properly handle WebSocket connections
    // For now, we'll call transcribeAndRespond which expects a WebSocket
    // Note: This endpoint would need to be refactored to properly handle WebSocket connections
    // or we need to change the approach to use HTTP-based communication

    return json({
      error: "WebSocket-based transcription not supported via HTTP. Use WebSocket connection directly.",
    });
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error transcribing audio:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to transcribe audio",
      },
      { status: 500 }
    );
  }
};

