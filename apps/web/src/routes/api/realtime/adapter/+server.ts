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

    const { ingestEndpoint, streamEndpoint } = (await request.json()) as {
      ingestEndpoint?: string;
      streamEndpoint?: string;
    };

    if (!ingestEndpoint || !streamEndpoint) {
      return json(
        { error: "ingestEndpoint and streamEndpoint are required" },
        { status: 400 }
      );
    }

    // Get the ChatAgent namespace from the environment
    const chatAgentNamespace = event.platform.env.ChatAgent;
    if (!chatAgentNamespace) {
      return json({ error: "ChatAgent binding not found" }, { status: 500 });
    }

    // Get or create an agent instance for this user
    const agentStub = chatAgentNamespace.getByName(userId);

    // Call the createRealtimeAdapters method on the agent
    const result = await (
      agentStub as unknown as {
        createRealtimeAdapters: (
          ingestEndpoint: string,
          streamEndpoint: string
        ) => Promise<{ ingest: unknown; stream: unknown }>;
      }
    ).createRealtimeAdapters(ingestEndpoint, streamEndpoint);

    return json({
      ingest: result.ingest,
      stream: result.stream,
    });
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error creating Realtime adapters:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Realtime adapters",
      },
      { status: 500 }
    );
  }
};

export const DELETE: RequestHandler = async ({ request }) => {
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

    // Get or create an agent instance for this user
    const agentStub = chatAgentNamespace.getByName(userId);

    // Call the cleanupRealtime method on the agent
    await (
      agentStub as unknown as {
        cleanupRealtime: () => Promise<void>;
      }
    ).cleanupRealtime();

    return json({ success: true });
  } catch (error) {
    // biome-ignore lint: console.error is used for debugging
    console.error("Error cleaning up Realtime adapters:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to cleanup Realtime adapters",
      },
      { status: 500 }
    );
  }
};

