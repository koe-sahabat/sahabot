import RobotFace from "./RobotFace";

interface HomeScreenProps {
  onSpeak: () => void;
  onMap: () => void;
}

export default function HomeScreen({ onSpeak, onMap }: HomeScreenProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-white to-brand-50">
      {/* Robot face */}
      <div className="animate-fade-slide-up mb-4">
        <RobotFace size={220} expression="idle" />
      </div>

      {/* Greeting */}
      <h1
        className="animate-fade-slide-up mb-2 text-3xl font-semibold tracking-tight text-gray-900"
        style={{ animationDelay: "0.1s" }}
      >
        Hello, welcome!
      </h1>
      <p
        className="animate-fade-slide-up mb-12 text-lg font-light text-gray-500"
        style={{ animationDelay: "0.15s" }}
      >
        How can I help you today?
      </p>

      {/* Action buttons */}
      <div
        className="animate-fade-slide-up flex gap-6"
        style={{ animationDelay: "0.25s" }}
      >
        <button
          onClick={onSpeak}
          className="group flex h-20 w-52 items-center justify-center gap-3 rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-200 transition-all duration-200 active:scale-95"
        >
          <svg
            className="h-7 w-7 transition-transform duration-200 group-active:scale-110"
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
          <span className="text-xl font-semibold">Speak</span>
        </button>

        <button
          onClick={onMap}
          className="group flex h-20 w-52 items-center justify-center gap-3 rounded-2xl bg-white text-gray-800 shadow-lg shadow-gray-200 ring-1 ring-gray-200 transition-all duration-200 active:scale-95"
        >
          <svg
            className="h-7 w-7 transition-transform duration-200 group-active:scale-110"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
            />
          </svg>
          <span className="text-xl font-semibold">Map</span>
        </button>
      </div>
    </div>
  );
}
