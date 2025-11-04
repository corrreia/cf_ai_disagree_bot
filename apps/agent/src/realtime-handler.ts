/// <reference path="./worker-configuration.d.ts" />
import { WorkersAIWhisperSTT } from "./stt-component";
import { WorkersAIMelottsTTS } from "./tts-component";

// Using Cloudflare.Env which has AI: Ai defined
type Ai = Cloudflare.Env["AI"];

type RealtimeAdapterConfig = {
  appId: string;
  apiToken: string;
  accountId: string;
};

type AdapterInfo = {
  adapterId: string;
  sessionId: string;
  trackName: string;
  endpoint: string;
};

/**
 * Handles Realtime SFU WebSocket adapter operations
 */
export class RealtimeAdapterHandler {
  private readonly env: {
    AI: Ai;
    REALTIME_APP_ID?: string;
    REALTIME_API_TOKEN?: string;
    ACCOUNT_ID?: string;
  };
  private readonly stt: WorkersAIWhisperSTT;
  private readonly tts: WorkersAIMelottsTTS;
  private ingestAdapter: AdapterInfo | null = null;
  private streamAdapter: AdapterInfo | null = null;
  private ingestWs: WebSocket | null = null;
  private streamWs: WebSocket | null = null;

  constructor(env: {
    AI: Ai;
    REALTIME_APP_ID?: string;
    REALTIME_API_TOKEN?: string;
    ACCOUNT_ID?: string;
  }) {
    this.env = env;
    this.stt = new WorkersAIWhisperSTT(env);
    this.tts = new WorkersAIMelottsTTS(env);
  }

  /**
   * Get Realtime SFU configuration
   */
  private getConfig(): RealtimeAdapterConfig {
    const appId = this.env.REALTIME_APP_ID;
    const apiToken = this.env.REALTIME_API_TOKEN;
    const accountId = this.env.ACCOUNT_ID;

    if (!appId) {
      throw new Error(
        "Realtime SFU configuration missing. Set REALTIME_APP_ID secret."
      );
    }
    if (!apiToken) {
      throw new Error(
        "Realtime SFU configuration missing. Set REALTIME_API_TOKEN secret."
      );
    }
    if (!accountId) {
      throw new Error(
        "Realtime SFU configuration missing. Set ACCOUNT_ID secret."
      );
    }

    return { appId, apiToken, accountId };
  }

  /**
   * Create a WebSocket adapter for ingesting audio (client -> agent)
   */
  async createIngestAdapter(
    endpoint: string,
    trackName: string
  ): Promise<AdapterInfo> {
    const config = this.getConfig();
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/realtime/sfu/apps/${config.appId}/adapters/websocket/new`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tracks: [
          {
            location: "local",
            trackName,
            endpoint,
            inputCodec: "pcm",
            mode: "buffer",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create ingest adapter: ${response.status} ${errorText}`
      );
    }

    const data = (await response.json()) as {
      tracks?: Array<{
        trackName: string;
        adapterId: string;
        sessionId: string;
        endpoint: string;
      }>;
    };

    if (!data.tracks || data.tracks.length === 0) {
      throw new Error("No tracks returned from adapter creation");
    }

    const track = data.tracks[0];
    this.ingestAdapter = {
      adapterId: track.adapterId,
      sessionId: track.sessionId,
      trackName: track.trackName,
      endpoint: track.endpoint,
    };

    return this.ingestAdapter;
  }

  /**
   * Create a WebSocket adapter for streaming audio (agent -> client)
   */
  async createStreamAdapter(
    sessionId: string,
    trackName: string,
    endpoint: string
  ): Promise<AdapterInfo> {
    const config = this.getConfig();
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/realtime/sfu/apps/${config.appId}/adapters/websocket/new`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tracks: [
          {
            location: "remote",
            sessionId,
            trackName,
            endpoint,
            outputCodec: "pcm",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create stream adapter: ${response.status} ${errorText}`
      );
    }

    const data = (await response.json()) as {
      tracks?: Array<{
        trackName: string;
        adapterId: string;
        sessionId: string;
        endpoint: string;
      }>;
    };

    if (!data.tracks || data.tracks.length === 0) {
      throw new Error("No tracks returned from adapter creation");
    }

    const track = data.tracks[0];
    this.streamAdapter = {
      adapterId: track.adapterId,
      sessionId: track.sessionId,
      trackName: track.trackName,
      endpoint: track.endpoint,
    };

    return this.streamAdapter;
  }

  /**
   * Close an adapter
   */
  async closeAdapter(adapterId: string): Promise<void> {
    const config = this.getConfig();
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/realtime/sfu/apps/${config.appId}/adapters/websocket/close`;

    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tracks: [{ adapterId }],
      }),
    });
  }

  /**
   * Process incoming audio chunk from WebSocket adapter
   */
  addAudioChunk(audioData: Uint8Array): void {
    this.stt.addAudioChunk(audioData);
  }

  /**
   * Transcribe accumulated audio
   */
  transcribe(): Promise<string> {
    return this.stt.transcribe();
  }

  /**
   * Synthesize text to audio and send via stream adapter
   */
  async synthesizeAndStream(text: string, ws: WebSocket): Promise<void> {
    try {
      for await (const audioChunk of this.tts.synthesize(text)) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(audioChunk);
        }
      }
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error synthesizing and streaming audio:", error);
      throw error;
    }
  }

  /**
   * Cleanup adapters
   */
  async cleanup(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.ingestAdapter) {
      promises.push(this.closeAdapter(this.ingestAdapter.adapterId));
      this.ingestAdapter = null;
    }

    if (this.streamAdapter) {
      promises.push(this.closeAdapter(this.streamAdapter.adapterId));
      this.streamAdapter = null;
    }

    await Promise.all(promises);

    if (this.ingestWs) {
      this.ingestWs.close();
      this.ingestWs = null;
    }

    if (this.streamWs) {
      this.streamWs.close();
      this.streamWs = null;
    }

    this.stt.clearBuffer();
  }

  getIngestAdapter(): AdapterInfo | null {
    return this.ingestAdapter;
  }

  getStreamAdapter(): AdapterInfo | null {
    return this.streamAdapter;
  }
}
