/**
 * Realtime Client - Manages Realtime SFU sessions and WebSocket adapters
 */

interface AdapterInfo {
  adapterId: string;
  sessionId: string;
  trackName: string;
  endpoint: string;
}

interface AdapterResponse {
  ingest: AdapterInfo;
  stream: AdapterInfo;
}

export class RealtimeClient {
  private ingestWs: WebSocket | null = null;
  private streamWs: WebSocket | null = null;
  private adapters: AdapterResponse | null = null;
  private onAudioChunk: ((chunk: Uint8Array) => void) | null = null;
  private onStreamAudio: ((chunk: Uint8Array) => void) | null = null;

  /**
   * Create Realtime SFU adapters
   */
  async createAdapters(
    ingestEndpoint: string,
    streamEndpoint: string
  ): Promise<AdapterResponse> {
    const response = await fetch("/api/realtime/adapter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ingestEndpoint,
        streamEndpoint,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create adapters");
    }

    const data = (await response.json()) as AdapterResponse;
    this.adapters = data;
    return data;
  }

  /**
   * Connect to ingest WebSocket (client -> agent)
   */
  connectIngest(
    endpoint: string,
    onAudioChunk: (chunk: Uint8Array) => void
  ): void {
    if (this.ingestWs) {
      this.ingestWs.close();
    }

    this.onAudioChunk = onAudioChunk;
    this.ingestWs = new WebSocket(endpoint);

    this.ingestWs.onopen = () => {
      // biome-ignore lint: console.log is used for debugging
      console.log("Ingest WebSocket connected");
    };

    this.ingestWs.onmessage = (event) => {
      // The ingest adapter receives audio from us, so we shouldn't receive messages
      // But handle it just in case
      if (event.data instanceof ArrayBuffer) {
        const chunk = new Uint8Array(event.data);
        onAudioChunk(chunk);
      }
    };

    this.ingestWs.onerror = (error) => {
      // biome-ignore lint: console.error is used for debugging
      console.error("Ingest WebSocket error:", error);
    };

    this.ingestWs.onclose = () => {
      // biome-ignore lint: console.log is used for debugging
      console.log("Ingest WebSocket closed");
      this.ingestWs = null;
    };
  }

  /**
   * Connect to stream WebSocket (agent -> client)
   */
  connectStream(
    endpoint: string,
    onStreamAudio: (chunk: Uint8Array) => void
  ): void {
    if (this.streamWs) {
      this.streamWs.close();
    }

    this.onStreamAudio = onStreamAudio;
    this.streamWs = new WebSocket(endpoint);

    this.streamWs.onopen = () => {
      // biome-ignore lint: console.log is used for debugging
      console.log("Stream WebSocket connected");
    };

    this.streamWs.onmessage = (event) => {
      // Receive audio chunks from agent
      if (event.data instanceof ArrayBuffer) {
        const chunk = new Uint8Array(event.data);
        onStreamAudio(chunk);
      } else if (event.data instanceof Blob) {
        // Convert Blob to ArrayBuffer
        event.data.arrayBuffer().then((buffer) => {
          const chunk = new Uint8Array(buffer);
          onStreamAudio(chunk);
        });
      }
    };

    this.streamWs.onerror = (error) => {
      // biome-ignore lint: console.error is used for debugging
      console.error("Stream WebSocket error:", error);
    };

    this.streamWs.onclose = () => {
      // biome-ignore lint: console.log is used for debugging
      console.log("Stream WebSocket closed");
      this.streamWs = null;
    };
  }

  /**
   * Send audio chunk to ingest WebSocket
   */
  sendAudioChunk(chunk: Uint8Array): void {
    if (this.ingestWs && this.ingestWs.readyState === WebSocket.OPEN) {
      // Send binary data
      this.ingestWs.send(chunk);
    }
  }

  /**
   * Close all connections and cleanup adapters
   */
  async cleanup(): Promise<void> {
    if (this.ingestWs) {
      this.ingestWs.close();
      this.ingestWs = null;
    }

    if (this.streamWs) {
      this.streamWs.close();
      this.streamWs = null;
    }

    if (this.adapters) {
      try {
        await fetch("/api/realtime/adapter", {
          method: "DELETE",
        });
      } catch (error) {
        // biome-ignore lint: console.error is used for debugging
        console.error("Error cleaning up adapters:", error);
      }
      this.adapters = null;
    }

    this.onAudioChunk = null;
    this.onStreamAudio = null;
  }

  /**
   * Get current adapters
   */
  getAdapters(): AdapterResponse | null {
    return this.adapters;
  }

  /**
   * Check if ingest is connected
   */
  isIngestConnected(): boolean {
    return this.ingestWs !== null && this.ingestWs.readyState === WebSocket.OPEN;
  }

  /**
   * Check if stream is connected
   */
  isStreamConnected(): boolean {
    return this.streamWs !== null && this.streamWs.readyState === WebSocket.OPEN;
  }
}

