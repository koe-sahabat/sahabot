import { useState, useEffect, useRef, useCallback } from "react";
import RobotFace from "./RobotFace";

interface SpeakModeProps {
  onBack: () => void;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";
type SpeakState = "idle" | "recording" | "processing" | "speaking";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

export default function SpeakMode({ onBack }: SpeakModeProps) {
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<SpeakState>("idle");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // Cleanup function for microphone and audio
  const cleanup = useCallback(() => {
    // Stop recording if active
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Release microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Stop audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Play next audio chunk from queue
  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = audioQueueRef.current.shift();
    if (!next) {
      setState("idle");
      return;
    }
    isPlayingRef.current = true;
    setState("speaking");

    const raw = atob(next);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/mp3" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    const finish = () => {
      URL.revokeObjectURL(url);
      audioRef.current = null;
      isPlayingRef.current = false;
      playNextInQueue();
    };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  }, []);

  // Handle WebSocket messages
  const handleServerMessage = useCallback(
    (msg: { type: string; data?: string }) => {
      switch (msg.type) {
        case "speech_end":
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          break;

        case "audio":
          if (msg.data) {
            audioQueueRef.current.push(msg.data);
            playNextInQueue();
          }
          break;

        case "audio_done":
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
            setState("idle");
          }
          break;

        case "error":
          setState("idle");
          break;
      }
    },
    [playNextInQueue]
  );

  // WebSocket lifecycle
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    function connect() {
      if (disposed) return;

      setConnection("connecting");
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!disposed) setConnection("connected");
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnection("disconnected");
        wsRef.current = null;
        setState("idle");
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [handleServerMessage]);

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    if (state === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (state !== "idle") return;

    // Abort if WebSocket is not open
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Interrupt playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      // Notify backend before starting the recorder
      wsRef.current.send(JSON.stringify({ type: "audio_start" }));

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const arrayBuffer = await e.data.arrayBuffer();
          wsRef.current.send(arrayBuffer);
        }
      };

      recorder.onstop = () => {
        // Release microphone tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          setState("processing");
          wsRef.current.send(JSON.stringify({ type: "audio_end" }));
        } else {
          setState("idle");
        }
      };

      // 100ms chunks for lower latency
      recorder.start(100);
      setState("recording");
    } catch {
      // Microphone access denied or other error
      setState("idle");
    }
  }, [state]);

  // Handle back button with cleanup
  const handleBack = useCallback(() => {
    cleanup();
    onBack();
  }, [cleanup, onBack]);

  const robotExpression = state === "recording" ? "listening" : state === "speaking" ? "speaking" : "idle";

  const statusText = () => {
    switch (state) {
      case "recording": return "Listening...";
      case "processing": return "Thinking...";
      case "speaking": return "Speaking...";
      default: return "Tap to speak";
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="absolute left-6 top-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200"
      >
        <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      {/* Connection indicator */}
      <div className="absolute right-6 top-6 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${
          connection === "connected" ? "bg-emerald-500" : connection === "connecting" ? "bg-amber-400 animate-pulse" : "bg-red-400"
        }`} />
      </div>

      {/* Robot face */}
      <div className="mb-8">
        <RobotFace size={120} expression={robotExpression} />
      </div>

      {/* Audio wave animation when speaking */}
      {state === "speaking" && (
        <div className="mb-8 flex items-end justify-center gap-1 h-12">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className="w-2 rounded-full bg-brand-500 animate-pulse"
              style={{
                height: `${20 + Math.random() * 28}px`,
                animationDelay: `${i * 0.1}s`,
                animationDuration: "0.5s",
              }}
            />
          ))}
        </div>
      )}

      {/* Recording wave */}
      {state === "recording" && (
        <div className="mb-8 flex items-end justify-center gap-1 h-12">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className="w-2 rounded-full bg-red-400 animate-pulse"
              style={{
                height: `${20 + Math.random() * 28}px`,
                animationDelay: `${i * 0.1}s`,
                animationDuration: "0.3s",
              }}
            />
          ))}
        </div>
      )}

      {/* Processing spinner */}
      {state === "processing" && (
        <div className="mb-8 h-12 flex items-center justify-center">
          <svg className="h-8 w-8 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* Idle spacer */}
      {state === "idle" && <div className="mb-8 h-12" />}

      {/* Mic button */}
      <button
        onClick={toggleRecording}
        disabled={(state !== "idle" && state !== "recording") || connection !== "connected"}
        className={`flex h-20 w-20 items-center justify-center rounded-full transition-all duration-200 ${
          state === "recording"
            ? "bg-red-500 scale-110 shadow-lg shadow-red-200"
            : state === "idle"
              ? "bg-brand-600 shadow-lg shadow-brand-200"
              : "bg-gray-300"
        }`}
      >
        {state === "recording" ? (
          <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      {/* Status text */}
      <p className="mt-4 text-sm font-medium text-gray-500">{statusText()}</p>
    </div>
  );
}
