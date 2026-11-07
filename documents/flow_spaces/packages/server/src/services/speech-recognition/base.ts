import type { SpeechRecognitionConfig, SpeechRecognitionResult } from '@agent-spaces/shared'

export interface SpeechRecognitionSession {
  sendAudio(data: Buffer): void
  end(): void
  onResult(cb: (result: SpeechRecognitionResult) => void): void
  onError(cb: (err: Error) => void): void
  onClose(cb: () => void): void
}

export abstract class SpeechRecognitionProviderBase {
  abstract readonly provider: string
  abstract createSession(config: SpeechRecognitionConfig): Promise<SpeechRecognitionSession>
}
