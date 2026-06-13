import { useState, useRef, useEffect, useCallback } from 'react';

export default function useAudioPlayer() {
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const audioRef = useRef(null);
  const pendingPlayRef = useRef(false);
  const onEndedRef = useRef(null);

  useEffect(() => {
    if (!audioUrl) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = audioUrl;
    audio.volume = volume;
    audioRef.current = audio;

    const onLoaded = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      if (pendingPlayRef.current) {
        audio.play().catch(() => {});
        setIsPlaying(true);
        pendingPlayRef.current = false;
      }
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      if (onEndedRef.current) onEndedRef.current();
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    setIsLoading(true);
    setIsPlaying(false);
    setCurrentTime(0);
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || isLoading) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, isLoading]);

  const seek = useCallback((fraction) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(1, fraction)) * duration;
  }, [duration]);

  const loadAudio = useCallback((url, autoPlay = true) => {
    pendingPlayRef.current = autoPlay;
    setAudioUrl(url);
  }, []);

  const setVolume = useCallback((v) => {
    setVolumeState(Math.max(0, Math.min(1, v)));
  }, []);

  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioUrl(null);
    audioRef.current = null;
  }, []);

  const formatTime = useCallback((seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  return {
    audioUrl, isPlaying, isLoading, currentTime, duration, volume,
    toggle, seek, loadAudio, formatTime, setVolume, replay, stop, onEndedRef,
  };
}
