interface RobotFaceProps {
  size?: number;
  expression?: "idle" | "listening" | "speaking";
}

export default function RobotFace({
  size = 200,
  expression = "idle",
}: RobotFaceProps) {
  const isListening = expression === "listening";
  const isSpeaking = expression === "speaking";

  return (
    <div className="animate-breathe flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Head outline - rounded rectangle */}
        <rect
          x="20"
          y="30"
          width="160"
          height="140"
          rx="40"
          fill="white"
          stroke="#E0E7FF"
          strokeWidth="2"
        />

        {/* Subtle inner glow */}
        <rect
          x="24"
          y="34"
          width="152"
          height="132"
          rx="38"
          fill="url(#faceGradient)"
        />

        {/* Left eye */}
        <g className="animate-blink" style={{ transformOrigin: "72px 95px" }}>
          <rect x="52" y="78" width="40" height="34" rx="17" fill="#4338CA" />
          <g className="animate-pupil">
            <circle cx="72" cy="95" r="6" fill="white" />
            {isListening && (
              <circle cx="72" cy="95" r="8" fill="white" opacity="0.5" />
            )}
          </g>
        </g>

        {/* Right eye */}
        <g className="animate-blink" style={{ transformOrigin: "128px 95px" }}>
          <rect x="108" y="78" width="40" height="34" rx="17" fill="#4338CA" />
          <g className="animate-pupil">
            <circle cx="128" cy="95" r="6" fill="white" />
            {isListening && (
              <circle cx="128" cy="95" r="8" fill="white" opacity="0.5" />
            )}
          </g>
        </g>

        {/* Mouth */}
        {isSpeaking ? (
          <ellipse
            cx="100"
            cy="138"
            rx="14"
            ry="8"
            fill="#4338CA"
            opacity="0.6"
          />
        ) : (
          <path
            d="M80 135 Q100 148 120 135"
            stroke="#4338CA"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            opacity="0.6"
          />
        )}

        {/* Antenna */}
        <line
          x1="100"
          y1="30"
          x2="100"
          y2="16"
          stroke="#C7D2FE"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle
          cx="100"
          cy="12"
          r="5"
          fill={isListening ? "#6366F1" : "#C7D2FE"}
        >
          {isListening && (
            <animate
              attributeName="fill"
              values="#6366F1;#A5B4FC;#6366F1"
              dur="1s"
              repeatCount="indefinite"
            />
          )}
        </circle>

        {/* Gradient definition */}
        <defs>
          <linearGradient
            id="faceGradient"
            x1="100"
            y1="34"
            x2="100"
            y2="166"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#F8FAFF" />
            <stop offset="1" stopColor="#EEF2FF" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
