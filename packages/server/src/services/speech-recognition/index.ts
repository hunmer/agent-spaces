import type { SpeechRecognitionConfig } from '@agent-spaces/shared'
import { SpeechRecognitionProviderBase, type SpeechRecognitionSession } from './base.js'
import { TencentSpeechProvider } from './tencent.js'

const providers: SpeechRecognitionProviderBase[] = [
  new TencentSpeechProvider(),
]

function getProvider(provider: string): SpeechRecognitionProviderBase {
  const p = providers.find(p => p.provider === provider)
  if (!p) throw new Error(`Unknown speech recognition provider: ${provider}`)
  return p
}

export async function createSpeechSession(config: SpeechRecognitionConfig): Promise<SpeechRecognitionSession> {
  return getProvider(config.provider).createSession(config)
}

export { SpeechRecognitionProviderBase }
