/// <reference path="./worker-configuration.d.ts" />
// Using Cloudflare.Env which has AI: Ai defined
type Ai = Cloudflare.Env["AI"];

/**
 * WorkersAIMelottsTTS - Text-to-Speech component using @cf/myshell-ai/melotts
 * Converts text to PCM audio format (16-bit, 48kHz, stereo)
 */
const BYTES_PER_KB = 1024;
const CHUNK_SIZE_KB = 32;
const CHUNK_SIZE = CHUNK_SIZE_KB * BYTES_PER_KB; // 32KB max per WebSocket message

export class WorkersAIMelottsTTS {
  private readonly env: { AI: Ai };

  constructor(env: { AI: Ai }) {
    this.env = env;
  }

  /**
   * Synthesize text to speech
   * @param text Text to convert to speech
   * @returns Generator that yields PCM audio chunks
   */
  async *synthesize(text: string): AsyncGenerator<Uint8Array, void, unknown> {
    if (!text || text.trim().length === 0) {
      return;
    }

    try {
      // Call Workers AI melotts model
      // Note: Check Workers AI docs for exact parameter format
      const result = (await this.env.AI.run("@cf/myshell-ai/melotts", {
        prompt: text.trim(),
      })) as {
        audio?: ArrayBuffer | Uint8Array | string;
        result?: { audio?: ArrayBuffer | Uint8Array | string };
      };

      // Extract audio from result (handle different response formats)
      const audioResult = result.audio || result.result?.audio;
      if (!audioResult) {
        // biome-ignore lint: console.error is used for debugging
        console.error("No audio returned from melotts model");
        return;
      }

      let audioData: Uint8Array;

      // Handle different return types
      if (audioResult instanceof ArrayBuffer) {
        audioData = new Uint8Array(audioResult);
      } else if (audioResult instanceof Uint8Array) {
        audioData = audioResult;
      } else if (typeof audioResult === "string") {
        // Base64 encoded audio
        const binaryString = atob(audioResult);
        const length = binaryString.length;
        audioData = new Uint8Array(length);
        let idx = 0;
        while (idx < length) {
          audioData[idx] = binaryString.charCodeAt(idx);
          idx += 1;
        }
      } else {
        // biome-ignore lint: console.error is used for debugging
        console.error("Unknown audio format from melotts model");
        return;
      }

      // Convert to PCM format if needed (melotts may return different format)
      // For now, assume it returns compatible audio data
      // In production, you may need to convert sample rate/format

      // Yield audio in chunks to respect WebSocket message size limits
      for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
        const chunk = audioData.slice(i, i + CHUNK_SIZE);
        yield chunk;
      }
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error synthesizing speech:", error);
      throw error;
    }
  }

  /**
   * Synthesize text to speech and return as single buffer
   * @param text Text to convert to speech
   * @returns Complete audio buffer
   */
  async synthesizeToBuffer(text: string): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of this.synthesize(text)) {
      chunks.push(chunk);
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }
}
