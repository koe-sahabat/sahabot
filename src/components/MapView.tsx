import { useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import type { Station } from "../types";
import { stations } from "../data/stations";
import StationInfo from "./StationInfo";
import * as THREE from "three";

interface MapViewProps {
  onBack: () => void;
}

/* ── 3D Station Marker ─────────────────────────────────── */

function StationMarker({
  station,
  isSelected,
  onClick,
}: {
  station: Station;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <group
      position={[station.position.x, 0.01, station.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      {/* Base disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[1.1, 32]} />
        <meshStandardMaterial
          color={station.color}
          transparent
          opacity={isSelected ? 0.4 : 0.18}
        />
      </mesh>

      {/* Pin body */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 1.2, 16]} />
        <meshStandardMaterial color={station.color} />
      </mesh>

      {/* Pin top sphere */}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial
          color={station.color}
          emissive={station.color}
          emissiveIntensity={isSelected ? 0.5 : 0.15}
        />
      </mesh>

      {/* Label number (HTML overlay - always renders) */}
      <Html position={[0, 1.6, 0]} center distanceFactor={12}>
        <div
          style={{
            color: "white",
            fontWeight: 700,
            fontSize: "14px",
            fontFamily: "Inter, system-ui, sans-serif",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {station.label}
        </div>
      </Html>

      {/* Station name floating above */}
      <Html position={[0, 2.8, 0]} center distanceFactor={12}>
        <div
          style={{
            color: "#1E293B",
            fontWeight: 600,
            fontSize: "13px",
            fontFamily: "Inter, system-ui, sans-serif",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none",
            background: "rgba(255,255,255,0.85)",
            padding: "2px 8px",
            borderRadius: "6px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          {station.name}
        </div>
      </Html>
    </group>
  );
}

/* ── Gallery Floor & Walls ────────────────────────────── */

const wallSegments = [
  // Outer walls
  { position: [-9, 0.75, 0] as const, size: [0.15, 1.5, 16] as const },
  { position: [9, 0.75, 0] as const, size: [0.15, 1.5, 16] as const },
  { position: [0, 0.75, -8] as const, size: [18, 1.5, 0.15] as const },
  { position: [-4, 0.75, 8] as const, size: [10, 1.5, 0.15] as const },
  { position: [4, 0.75, 8] as const, size: [10, 1.5, 0.15] as const },
  // Internal dividers
  { position: [0, 0.6, -3] as const, size: [0.12, 1.2, 4] as const },
  { position: [-3, 0.6, 2] as const, size: [6, 1.2, 0.12] as const },
  { position: [3, 0.6, 2] as const, size: [6, 1.2, 0.12] as const },
];

function GalleryFloor() {
  return (
    <>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[18, 16]} />
        <meshStandardMaterial color="#F1F5F9" side={THREE.DoubleSide} />
      </mesh>

      {/* Floor grid */}
      <gridHelper
        args={[18, 18, "#CBD5E1", "#E2E8F0"]}
        position={[0, 0.005, 0]}
      />

      {/* Walls */}
      {wallSegments.map((wall, i) => (
        <mesh key={i} position={[wall.position[0], wall.position[1], wall.position[2]]}>
          <boxGeometry args={[wall.size[0], wall.size[1], wall.size[2]]} />
          <meshStandardMaterial color="#C7D2FE" transparent opacity={0.6} />
        </mesh>
      ))}

      {/* Entrance label (HTML overlay) */}
      <Html position={[0, 0.15, 8.2]} center distanceFactor={14}>
        <div
          style={{
            color: "#94A3B8",
            fontWeight: 600,
            fontSize: "12px",
            fontFamily: "Inter, system-ui, sans-serif",
            letterSpacing: "2px",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          ENTRANCE
        </div>
      </Html>
    </>
  );
}

/* ── Scene ─────────────────────────────────────────────── */

function Scene({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, 8]} intensity={1.2} />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      <GalleryFloor />

      {stations.map((station) => (
        <StationMarker
          key={station.id}
          station={station}
          isSelected={selectedId === station.id}
          onClick={() =>
            onSelect(selectedId === station.id ? null : station.id)
          }
        />
      ))}

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
        minDistance={8}
        maxDistance={25}
        target={[0, 0, 0]}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
    </>
  );
}

/* ── MapView Component ────────────────────────────────── */

export default function MapView({ onBack }: MapViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedStation = stations.find((s) => s.id === selectedId) ?? null;

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-100 px-8 py-4">
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
        <h2 className="text-xl font-semibold text-gray-900">Gallery Map</h2>
        <div className="flex-1" />
        {/* Station pills */}
        <div className="flex gap-2">
          {stations.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelect(selectedId === s.id ? null : s.id)}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-all active:scale-95 ${
                selectedId === s.id
                  ? "text-white shadow-sm"
                  : "bg-gray-100 text-gray-600"
              }`}
              style={
                selectedId === s.id ? { backgroundColor: s.color } : undefined
              }
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Map + info panel */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 3D Canvas */}
        <div className="absolute inset-0" style={{ zIndex: 0 }}>
          <Canvas
            camera={{
              position: [12, 14, 12],
              fov: 40,
              near: 0.1,
              far: 100,
            }}
            style={{ background: "#F8FAFC", width: "100%", height: "100%" }}
          >
            <Scene selectedId={selectedId} onSelect={handleSelect} />
          </Canvas>
        </div>

        {/* Station info side panel */}
        {selectedStation && (
          <div className="absolute right-0 top-0 bottom-0 z-10">
            <StationInfo
              station={selectedStation}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
