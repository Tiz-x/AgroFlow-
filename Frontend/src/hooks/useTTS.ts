import { useCallback, useRef } from 'react';
import { BASE_URL } from '../services/apiConfig';

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (
    text: string,
    language: string = 'english',
    onEnd?: () => void,
  ) => {
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const token = localStorage.getItem('agf_token');

      const res = await fetch(`${BASE_URL}/voice/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, language }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Convert base64 to audio blob and play
      const byteChars   = atob(data.audio);
      const byteNumbers = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const blob     = new Blob([byteNumbers], { type: data.mimeType });
      const url      = URL.createObjectURL(blob);
      const audio    = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        onEnd?.();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        onEnd?.();
      };

      await audio.play();

    } catch (err: any) {
      console.error('TTS error:', err.message);
      onEnd?.();
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  return { speak, stop };
}