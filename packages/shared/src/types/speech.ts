export type SpeechRecognitionProvider = 'tencent'

export interface SpeechRecognitionConfig {
  id: string
  provider: SpeechRecognitionProvider
  label: string
  credentials: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface SpeechRecognitionResult {
  text: string
  isFinal: boolean
  sliceType: number
}

export type TencentSpeechCredentials = {
  appId: string
  secretId: string
  secretKey: string
}
