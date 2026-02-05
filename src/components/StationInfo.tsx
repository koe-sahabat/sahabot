import type { Station } from "../types";

interface StationInfoProps {
  station: Station;
  onClose: () => void;
}

export default function StationInfo({ station, onClose }: StationInfoProps) {
  return (
    <div className="animate-fade-slide-up flex h-full w-80 flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h3 className="text-lg font-semibold text-gray-900">{station.name}</h3>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 active:scale-95"
        >
          <svg
            className="h-5 w-5 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Image placeholder */}
      <div className="mx-6 flex h-40 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{ backgroundColor: station.color }}
        >
          {station.label}
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 px-6 pt-5">
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: station.color }}
        >
          {station.category}
        </span>

        <p className="mt-4 text-sm leading-relaxed text-gray-600">
          {station.description}
        </p>
      </div>

      {/* Action */}
      <div className="p-6">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-white shadow-sm transition-all active:scale-[0.98]">
          <svg
            className="h-5 w-5"
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
          <span className="text-sm font-semibold">Get Directions</span>
        </button>
      </div>
    </div>
  );
}
