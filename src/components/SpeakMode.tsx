import { useState, useCallback } from "react";
import RobotFace from "./RobotFace";
import type { ChatMessage } from "../types";

interface SpeakModeProps {
  onBack: () => void;
}

const MOCK_REPLIES = [
  "Station 3 features our oil and acrylic painting collection. Would you like directions?",
  "The gallery is open until 6 PM today. Enjoy your visit!",
  "I recommend starting at Station 1 and following the numbered route.",
  "The restrooms are located near the entrance, past Station 5.",
  "Our current exhibition changes quarterly. This season features local artists.",
];

export default function SpeakMode({ onBack }: SpeakModeProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "robot",
      text: "I'm listening. How can I help you?",
    },
  ]);
  const [isListening, setIsListening] = useState(false);

  const handleMicPress = useCallback(() => {
    if (isListening) return;

    setIsListening(true);

    // Simulate user speech after a delay
    setTimeout(() => {
      setIsListening(false);

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: "user",
        text: "Tell me about this gallery.",
      };
      setMessages((prev) => [...prev, userMsg]);

      // Simulate robot reply
      setTimeout(() => {
        const reply =
          MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)]!;
        const robotMsg: ChatMessage = {
          id: `robot-${Date.now()}`,
          sender: "robot",
          text: reply,
        };
        setMessages((prev) => [...prev, robotMsg]);
      }, 800);
    }, 2000);
  }, [isListening]);

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-white to-brand-50">
      {/* Header */}
      <div className="flex items-center gap-4 px-8 pt-6 pb-4">
        <button
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all active:scale-95"
        >
          <svg
            className="h-5 w-5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <RobotFace
            size={48}
            expression={isListening ? "listening" : "idle"}
          />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">SahaBot</h2>
            <p className="text-sm text-gray-500">
              {isListening ? "Listening..." : "Ready to help"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`animate-fade-slide-up flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-5 py-3.5 text-base leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-white text-gray-800 shadow-sm ring-1 ring-gray-100"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mic area */}
      <div className="flex flex-col items-center gap-3 pb-8 pt-4">
        {isListening && (
          <div className="flex items-end gap-1.5">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="wave-bar w-1.5 rounded-full bg-brand-400"
                style={{ height: 8 }}
              />
            ))}
          </div>
        )}
        <button
          onClick={handleMicPress}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
            isListening
              ? "bg-red-500 text-white shadow-lg shadow-red-200"
              : "bg-brand-600 text-white shadow-lg shadow-brand-200"
          }`}
        >
          {isListening && (
            <span className="animate-pulse-ring absolute inset-0 rounded-full bg-red-400" />
          )}
          <svg
            className="relative z-10 h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>
        <p className="text-sm font-medium text-gray-400">
          {isListening ? "Listening..." : "Tap to speak"}
        </p>
      </div>
    </div>
  );
}
