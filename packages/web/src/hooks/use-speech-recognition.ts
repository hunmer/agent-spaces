"use client";

import { useState, useCallback, useRef } from "react";
import { getToken } from "@/lib/auth";

interface SpeechRecognitionConfig {
  id: string;
  provider: string;
  credentials: Record<string, string>;
}

export function useSpeechRecognition() {
  const [isRecording, setIsRecording] = useState(false);
  const [config, setConfig] = useState<SpeechRecognitionConfig | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConfig = useCallback(async (): Promise<SpeechRecognitionConfig | null> => {
    const token = getToken();
    const res = await fetch("/api/speech-recognition", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const configs: SpeechRecognitionConfig[] = await res.json();
    return configs.length > 0 ? configs[0] : null;
  }, []);

  const start = useCallback(
    async (onText: (text: string, isFinal: boolean) => void) => {
      const cfg = await loadConfig();
      if (!cfg) return false;
      setConfig(cfg);

      const token = getToken();
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${location.host}/ws/speech?token=${token ?? ""}&configId=${cfg.id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            console.error("[speech]", data.error);
            return;
          }
          if (data.text) {
            onText(data.text, data.isFinal);
          }
        } catch {}
      };

      ws.onerror = () => {
        stop();
      };

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("WS connect failed"));
      }).catch(() => {
        return false;
      });

      // Get microphone stream
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
        });
      } catch {
        ws.close();
        return false;
      }
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        // Convert Float32 -> Int16 PCM
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        ws.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      return true;
    },
    [loadConfig]
  );

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
      wsRef.current.close();
    }
    wsRef.current = null;
    processorRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  return { isRecording, start, stop, config };
}
