/**
 * Audio Handler - Handles audio capture and playback using Web Audio API
 */

export class AudioHandler {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private stream: MediaStream | null = null;
  private audioElement: HTMLAudioElement | null = null;

  /**
   * Request microphone access and initialize audio context
   */
  async initialize(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 2,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 48000 });
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error initializing audio:", error);
      throw new Error("Failed to access microphone");
    }
  }

  /**
   * Start recording audio
   */
  startRecording(): void {
    if (!this.stream) {
      throw new Error("Audio not initialized. Call initialize() first.");
    }

    if (this.isRecording) {
      return;
    }

    this.audioChunks = [];
    this.isRecording = true;

    // Create MediaRecorder with PCM format if supported, otherwise use default
    const options: MediaRecorderOptions = {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 128000,
    };

    // Try to use PCM if available
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=pcm")) {
      options.mimeType = "audio/webm;codecs=pcm";
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
  }

  /**
   * Stop recording and return audio as PCM data
   */
  async stopRecording(): Promise<Uint8Array | null> {
    if (!this.mediaRecorder || !this.isRecording) {
      return null;
    }

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        this.isRecording = false;

        // Combine audio chunks
        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });

        // Convert to PCM format (16-bit, 48kHz, stereo)
        const pcmData = await this.convertToPCM(audioBlob);
        resolve(pcmData);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Convert audio blob to PCM format (16-bit, 48kHz, stereo)
   */
  private async convertToPCM(audioBlob: Blob): Promise<Uint8Array> {
    if (!this.audioContext) {
      throw new Error("Audio context not initialized");
    }

    try {
      // Decode audio data
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Convert to PCM
      const pcmData = this.audioBufferToPCM(audioBuffer);
      return pcmData;
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error converting to PCM:", error);
      // Fallback: return empty array or try direct conversion
      return new Uint8Array(0);
    }
  }

  /**
   * Convert AudioBuffer to PCM (16-bit, 48kHz, stereo)
   */
  private audioBufferToPCM(audioBuffer: AudioBuffer): Uint8Array {
    const length = audioBuffer.length;
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    // Resample to 48kHz if needed
    let resampledBuffer = audioBuffer;
    if (sampleRate !== 48000) {
      resampledBuffer = this.resampleAudioBuffer(audioBuffer, 48000);
    }

    // Ensure stereo (2 channels)
    let stereoData: Float32Array[];
    if (channels === 1) {
      // Convert mono to stereo
      const monoData = resampledBuffer.getChannelData(0);
      stereoData = [monoData, monoData];
    } else if (channels >= 2) {
      stereoData = [
        resampledBuffer.getChannelData(0),
        resampledBuffer.getChannelData(1),
      ];
    } else {
      throw new Error(`Unsupported channel count: ${channels}`);
    }

    // Convert to 16-bit PCM
    const pcmLength = resampledBuffer.length * 2 * 2; // 2 channels * 2 bytes per sample
    const pcmData = new Uint8Array(pcmLength);

    let offset = 0;
    for (let i = 0; i < resampledBuffer.length; i++) {
      // Left channel
      const leftSample = Math.max(-1, Math.min(1, stereoData[0][i]));
      const leftInt16 = Math.floor(leftSample * 0x7fff);
      pcmData[offset++] = leftInt16 & 0xff;
      pcmData[offset++] = (leftInt16 >> 8) & 0xff;

      // Right channel
      const rightSample = Math.max(-1, Math.min(1, stereoData[1][i]));
      const rightInt16 = Math.floor(rightSample * 0x7fff);
      pcmData[offset++] = rightInt16 & 0xff;
      pcmData[offset++] = (rightInt16 >> 8) & 0xff;
    }

    return pcmData;
  }

  /**
   * Resample AudioBuffer to target sample rate
   */
  private resampleAudioBuffer(
    audioBuffer: AudioBuffer,
    targetSampleRate: number
  ): AudioBuffer {
    const sourceSampleRate = audioBuffer.sampleRate;
    if (sourceSampleRate === targetSampleRate) {
      return audioBuffer;
    }

    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.round(audioBuffer.length / ratio);
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      newLength,
      targetSampleRate
    );
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    // Note: This is a simplified resampling. For production, use a proper resampling library
    return audioBuffer; // Placeholder - proper resampling needed
  }

  /**
   * Play PCM audio data
   */
  async playPCMAudio(pcmData: Uint8Array): Promise<void> {
    if (!this.audioContext) {
      throw new Error("Audio context not initialized");
    }

    try {
      // Convert PCM to AudioBuffer
      const audioBuffer = this.pcmToAudioBuffer(pcmData);

      // Create buffer source and play
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start(0);
    } catch (error) {
      // biome-ignore lint: console.error is used for debugging
      console.error("Error playing PCM audio:", error);
      throw error;
    }
  }

  /**
   * Convert PCM data to AudioBuffer
   */
  private pcmToAudioBuffer(pcmData: Uint8Array): AudioBuffer {
    if (!this.audioContext) {
      throw new Error("Audio context not initialized");
    }

    // Assume PCM is 16-bit, 48kHz, stereo
    const sampleCount = pcmData.length / 4; // 2 channels * 2 bytes per sample
    const audioBuffer = this.audioContext.createBuffer(2, sampleCount, 48000);

    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.getChannelData(1);

    for (let i = 0; i < sampleCount; i++) {
      const offset = i * 4;

      // Left channel (little-endian 16-bit)
      const leftInt16 =
        pcmData[offset] | (pcmData[offset + 1] << 8);
      const leftSample = leftInt16 > 0x7fff ? leftInt16 - 0x10000 : leftInt16;
      leftChannel[i] = leftSample / 0x7fff;

      // Right channel (little-endian 16-bit)
      const rightInt16 =
        pcmData[offset + 2] | (pcmData[offset + 3] << 8);
      const rightSample =
        rightInt16 > 0x7fff ? rightInt16 - 0x10000 : rightInt16;
      rightChannel[i] = rightSample / 0x7fff;
    }

    return audioBuffer;
  }

  /**
   * Stream audio chunks as they're recorded
   */
  startStreaming(onChunk: (chunk: Uint8Array) => void): void {
    if (!this.stream) {
      throw new Error("Audio not initialized. Call initialize() first.");
    }

    if (this.isRecording) {
      return;
    }

    this.isRecording = true;

    // Use MediaRecorder with dataavailable event
    const options: MediaRecorderOptions = {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 128000,
    };

    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const pcmChunk = await this.convertToPCM(event.data);
        onChunk(pcmChunk);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
  }

  /**
   * Check if recording is active
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }
}

