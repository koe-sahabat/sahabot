import { useState, useEffect, useRef, useCallback } from "react";
import RobotFace from "./RobotFace";

interface SpeakModeProps {
  onBack: () => void;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";
type SpeakState = "idle" | "recording" | "processing" | "responding" | "speaking";

interface ChatMessage {
  id: string;
  sender: "robot" | "user";
  text: string;
}

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

export default function SpeakMode({ onBack }: SpeakModeProps) {
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<SpeakState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", sender: "robot", text: "Hello! Tap the microphone and ask me anything about the gallery." },
  ]);
  const [streamingText, setStreamingText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const allAudioReceivedRef = useRef(false);
  const msgIdRef = useRef(0);

  const nextId = () => `msg-${++msgIdRef.current}`;

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // ── Play next audio chunk from queue ──────────────────
  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current) return;
    const next = audioQueueRef.current.shift();
    if (!next) {
      // Queue empty — if all audio received, go idle
      if (allAudioReceivedRef.current) {
        setState("idle");
        allAudioReceivedRef.current = false;
      }
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

  // ── Handle a message from the backend ─────────────────
  const handleServerMessage = useCallback(
    (msg: { type: string; text?: string; data?: string; mime?: string; message?: string; status?: string }) => {
      switch (msg.type) {
        case "status":
          if (msg.status === "transcribing") setStatusText("Transcribing\u2026");
          if (msg.status === "synthesizing") setStatusText("Generating speech\u2026");
          break;

        case "listening":
          // Backend acknowledged audio_start, streaming is now active
          break;

        case "speech_end":
          // VAD detected user stopped speaking - auto-stop recording
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          break;

        case "transcription_interim":
          // Real-time transcription while user is speaking
          setInterimTranscript(msg.text ?? "");
          break;

        case "transcription":
          setMessages((prev) => [...prev, { id: nextId(), sender: "user", text: msg.text ?? "" }]);
          setStatusText("");
          setInterimTranscript("");
          break;

        case "response_start":
          setState("responding");
          setStreamingText("");
          allAudioReceivedRef.current = false;
          audioQueueRef.current = [];
          break;

        case "response_chunk":
          setStreamingText((prev) => prev + (msg.text ?? ""));
          break;

        case "response_end":
          setStreamingText("");
          setMessages((prev) => [...prev, { id: nextId(), sender: "robot", text: msg.text ?? "" }]);
          break;

        case "audio":
          // Queue audio chunk and start playing if not already
          setStatusText("");
          if (msg.data) {
            audioQueueRef.current.push(msg.data);
            playNextInQueue();
          }
          break;

        case "audio_done":
          allAudioReceivedRef.current = true;
          // If nothing is playing and queue is empty, go idle now
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
            setState("idle");
          }
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            { id: nextId(), sender: "robot", text: msg.message ?? "Something went wrong." },
          ]);
          setState("idle");
          setStatusText("");
          setInterimTranscript("");
          break;
      }
    },
    [playNextInQueue],
  );

  // ── WebSocket lifecycle ───────────────────────────────
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      setConnection("connecting");
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnection("connected");

      ws.onclose = () => {
        setConnection("disconnected");
        wsRef.current = null;
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
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [handleServerMessage]);

  // ── Toggle recording ──────────────────────────────────
  const toggleRecording = useCallback(async () => {
    if (state === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (state !== "idle") return;

    // Interrupt playback if the robot is still speaking
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    allAudioReceivedRef.current = false;
    setInterimTranscript("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      // Signal backend to start streaming STT session
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "audio_start" }));
      }

      // Stream audio chunks every 250ms as they become available
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          // Convert Blob to ArrayBuffer and send as binary frame
          const arrayBuffer = await e.data.arrayBuffer();
          wsRef.current.send(arrayBuffer);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());

        // Signal backend that audio stream is complete
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          setState("processing");
          setStatusText("Processing\u2026");
          wsRef.current.send(JSON.stringify({ type: "audio_end" }));
        } else {
          setState("idle");
        }
      };

      // Start recording with 100ms timeslice for faster streaming
      recorder.start(100);
      setState("recording");
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), sender: "robot", text: "I couldn't access the microphone. Please check your permissions." },
      ]);
    }
  }, [state]);

  // ── UI helpers ────────────────────────────────────────
  const micColor = (): string => {
    switch (state) {
      case "recording":
        return "bg-red-500 shadow-lg shadow-red-200 scale-110";
      case "processing":
      case "responding":
      case "speaking":
        return "bg-gray-300 cursor-not-allowed";
      default:
        return "bg-brand-600 shadow-lg shadow-brand-200";
    }
  };

  const micLabel = (): string => {
    switch (state) {
      case "recording":
        return "Tap to stop";
      case "processing":
        return "Processing\u2026";
      case "responding":
        return "Thinking\u2026";
      case "speaking":
        return "Speaking\u2026";
      default:
        return "Tap to speak";
    }
  };

  const robotExpression = state === "recording" ? "listening" : state === "speaking" ? "speaking" : "idle";

  // ── Render ────────────────────────────────────────────
  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-8 py-4">
        <button
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all active:scale-95"
        >
          <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <RobotFace size={44} expression={robotExpression} />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SahaBot</h2>
          <p className="text-xs text-gray-400">
            {state === "recording" ? "Listening\u2026" : state === "speaking" ? "Speaking\u2026" : "Ready to help"}
          </p>
        </div>
        <div className="flex-1" />
        {/* Connection dot */}
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              connection === "connected"
                ? "bg-emerald-500"
                : connection === "connecting"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-red-400"
            }`}
          />
          <span className="text-xs text-gray-400">
            {connection === "connected" ? "Online" : connection === "connecting" ? "Connecting\u2026" : "Offline"}
          </span>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
              {msg.sender === "robot" && (
                <div className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-600">
                  S
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-white text-gray-700 shadow-sm ring-1 ring-gray-100"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Streaming text */}
          {streamingText && (
            <div className="flex justify-start">
              <div className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-600">
                S
              </div>
              <div className="max-w-[75%] rounded-2xl bg-white px-5 py-3 text-sm leading-relaxed text-gray-700 shadow-sm ring-1 ring-gray-100">
                {streamingText}
                <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-brand-500" />
              </div>
            </div>
          )}

          {/* Processing spinner */}
          {statusText && state === "processing" && (
            <div className="flex justify-start">
              <div className="mr-3 h-9 w-9 shrink-0" />
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {statusText}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Recording waveform + interim transcription */}
      {state === "recording" && (
        <div className="flex flex-col items-center gap-2 pb-2 px-8">
          {interimTranscript && (
            <div className="w-full max-w-2xl rounded-lg bg-red-50 px-4 py-2 text-sm text-gray-700 border border-red-100">
              <span className="text-red-400 mr-2">Hearing:</span>
              {interimTranscript}
              <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-red-400" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex items-end gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="wave-bar w-1 rounded-full bg-red-400" style={{ height: 8 }} />
              ))}
            </div>
            <span className="text-sm font-medium text-red-500">Listening\u2026</span>
          </div>
        </div>
      )}

      {/* Mic button */}
      <div className="flex flex-col items-center gap-3 border-t border-gray-100 bg-white px-8 py-5">
        <button
          onClick={toggleRecording}
          disabled={
            (state !== "idle" && state !== "recording") || connection !== "connected"
          }
          className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${micColor()}`}
        >
          {state === "recording" && (
            <span className="animate-pulse-ring absolute inset-0 rounded-full bg-red-400" />
          )}

          {state === "recording" ? (
            <svg className="relative z-10 h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : state === "processing" || state === "responding" ? (
            <svg className="h-6 w-6 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : state === "speaking" ? (
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          ) : (
            <svg className="relative z-10 h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
        <span className="text-sm font-medium text-gray-500">{micLabel()}</span>
      </div>
    </div>
  );
}
