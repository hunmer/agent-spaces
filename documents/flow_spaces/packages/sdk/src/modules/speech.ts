import type { HttpClient } from '../client';
import type { SpeechRecognitionConfig } from '@agent-spaces/shared';

export function createSpeechApi(http: HttpClient) {
  return {
    list: (): Promise<SpeechRecognitionConfig[]> =>
      http.get('/api/speech-recognition'),

    create: (data: Partial<SpeechRecognitionConfig>): Promise<SpeechRecognitionConfig> =>
      http.post('/api/speech-recognition', data),

    update: (id: string, data: Partial<SpeechRecognitionConfig>): Promise<SpeechRecognitionConfig> =>
      http.put(`/api/speech-recognition/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/speech-recognition/${id}`),
  };
}
