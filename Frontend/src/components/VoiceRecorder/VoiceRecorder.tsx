import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { useToast } from "../../context/ToastContext";
import { BASE_URL } from "../../services/apiConfig";

export interface VoiceRecorderHandle {
  startRecording: () => void;
  stopAndSend: () => void;
  cancelRecording: () => void;
}

interface VoiceRecorderProps {
  onTranscript: (
    aiResponse: string,
    language?: string,
    originalText?: string,
  ) => void;
  disabled?: boolean;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onProcessingStateChange?: (isProcessing: boolean) => void;
  onAudioLevel?: (level: number) => void;
}

export const VoiceRecorder = forwardRef<
  VoiceRecorderHandle,
  VoiceRecorderProps
>(
  (
    {
      onTranscript,
      disabled,
      onRecordingStateChange,
      onProcessingStateChange,
      onAudioLevel,
    },
    ref,
  ) => {
    const { addToast } = useToast();

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const levelFrameRef = useRef<number | null>(null);
    const cancelledRef = useRef(false);
    const isRecordingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      startRecording,
      stopAndSend,
      cancelRecording,
    }));

    useEffect(() => {
      return () => {
        stopAudioContext();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
    }, []);

    const stopAudioContext = () => {
      if (levelFrameRef.current) cancelAnimationFrame(levelFrameRef.current);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };

    const startLevelMonitor = (stream: MediaStream) => {
      const ctx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        onAudioLevel?.(Math.round((avg / 255) * 100));
        levelFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    };

    const startRecording = async () => {
      if (disabled) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;
        cancelledRef.current = false;

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          stopAudioContext();
          stream.getTracks().forEach((t) => t.stop());
          onAudioLevel?.(0);
          if (cancelledRef.current) {
            onProcessingStateChange?.(false);
            return;
          }
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          await processAudio(audioBlob);
        };

        startLevelMonitor(stream);
        mediaRecorder.start();
        isRecordingRef.current = true;
        onRecordingStateChange?.(true);
      } catch (err) {
        console.error("Mic error:", err);
        addToast("Could not access microphone. Check permissions.", "error");
      }
    };

    const stopAndSend = () => {
      if (mediaRecorderRef.current && isRecordingRef.current) {
        cancelledRef.current = false;
        mediaRecorderRef.current.stop();
        isRecordingRef.current = false;
        onRecordingStateChange?.(false);
        onProcessingStateChange?.(true);
      }
    };

    const cancelRecording = () => {
      if (mediaRecorderRef.current && isRecordingRef.current) {
        cancelledRef.current = true;
        mediaRecorderRef.current.stop();
        isRecordingRef.current = false;
        onRecordingStateChange?.(false);
        onProcessingStateChange?.(false);
      }
    };

    const processAudio = async (audioBlob: Blob) => {
      try {
        const token = localStorage.getItem("agf_token");
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        const res = await fetch(
          `${BASE_URL}/voice/process`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );

        const data = await res.json();

        if (data.success) {
          addToast(`🗣️ "${data.originalText}"`, "success");
          // Pass: AI answer, detected language, what farmer actually said
          onTranscript(data.response, data.detectedLanguage, data.originalText);
        } else {
          // Show toast only — do NOT call onTranscript with any value
          // This prevents empty/error responses from being processed
          addToast(data.error || "Failed to process voice", "error");
          // Don't call onTranscript - nothing to display or speak
        }
      } catch (err) {
        console.error("❌ Voice processing error:", err);
        addToast("Failed to process voice. Please try again.", "error");
        // Don't call onTranscript - nothing to display or speak
      } finally {
        onProcessingStateChange?.(false);
      }
    };

    return null;
  },
);

VoiceRecorder.displayName = "VoiceRecorder";