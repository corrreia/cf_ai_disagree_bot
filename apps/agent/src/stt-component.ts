/// <reference path="./worker-configuration.d.ts" />
// Using Cloudflare.Env which has AI: Ai defined
type Ai = Cloudflare.Env["AI"];

/**
 * WorkersAIWhisperSTT - Speech-to-Text component using @cf/openai/whisper
 * Processes PCM audio chunks and converts them to text
 */
const BYTES_PER_KB = 1024;
const KB_PER_MB = 1024;
const MAX_BUFFER_SIZE = KB_PER_MB * BYTES_PER_KB; // 1MB max buffer

export class WorkersAIWhisperSTT {
  private readonly env: { AI: Ai };
  private audioBuffer: Uint8Array[] = [];

  constructor(env: { AI: Ai }) {
    this.env = env;
  }

  /**
   * Add audio chunk to buffer
   * @param audioData PCM audio data (16-bit, 48kHz, stereo)
   */
  addAudioChunk(audioData: Uint8Array): void {
    this.audioBuffer.push(audioData);

    // Prevent buffer overflow
    const totalSize = this.audioBuffer.reduce(
      (sum, chunk) => sum + chunk.length,
      0
    );
    if (totalSize > MAX_BUFFER_SIZE && this.audioBuffer.length > 1) {
      // Keep only the most recent chunks
      while (totalSize > MAX_BUFFER_SIZE && this.audioBuffer.length > 1) {
        this.audioBuffer.shift();
      }
    }
  }

  /**
   * Transcribe accumulated audio buffer
   * @returns Transcribed text
   */
  async transcribe(): Promise<string> {
    if (this.audioBuffer.length === 0) {
      return "";
    }

    try {
      // Combine all audio chunks
      const totalLength = this.audioBuffer.reduce(
        (sum, chunk) => sum + chunk.length,
        0
      );
      const combinedAudio = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of this.audioBuffer) {
        combinedAudio.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to ArrayBuffer for Workers AI
      const audioArrayBuffer = combinedAudio.buffer;

      // Call Workers AI Whisper model
      // Note: Workers AI whisper expects audio as ArrayBuffer
      const result = (await this.env.AI.run("@cf/openai/whisper", {
        audio: Array.from(new Uint8Array(audioArrayBuffer)),
      })) as { text?: string; transcription?: string };

      // Clear buffer after successful transcription
      this.audioBuffer = [];

      // Extract text from response
      return result.text || result.transcription || "";
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error transcribing audio:", error);
      throw error;
    }
  }

  /**
   * Clear the audio buffer
   */
  clearBuffer(): void {
    this.audioBuffer = [];
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }
}
