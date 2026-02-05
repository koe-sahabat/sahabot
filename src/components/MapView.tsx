import { useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, RoundedBox } from "@react-three/drei";
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
  const color = new THREE.Color(station.color);

  return (
    <group
      position={[station.position.x, 0.01, station.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Base disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[1.1, 32]} />
        <meshStandardMaterial
          color={station.color}
          transparent
          opacity={isSelected ? 0.35 : 0.15}
        />
      </mesh>

      {/* Pin body */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.35, 0.45, 1.2, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Pin top sphere */}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.4 : 0.1}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, 1.6, 0]}
        fontSize={0.45}
        color="white"
        anchorX="center"
        anchorY="middle"
        font="https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.woff2"
        fontWeight={700}
      >
        {station.label}
      </Text>

      {/* Station name (floating above) */}
      <Text
        position={[0, 2.5, 0]}
        fontSize={0.35}
        color="#1E293B"
        anchorX="center"
        anchorY="middle"
        font="https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.woff2"
        fontWeight={600}
      >
        {station.name}
      </Text>
    </group>
  );
}

/* ── Gallery Floor & Walls ────────────────────────────── */

function GalleryFloor() {
  return (
    <>
      {/* Main floor */}
      <RoundedBox
        args={[18, 0.15, 16]}
        radius={0.3}
        position={[0, -0.075, 0]}
      >
        <meshStandardMaterial color="#F8FAFC" />
      </RoundedBox>

      {/* Floor grid lines */}
      <gridHelper
        args={[18, 18, "#E2E8F0", "#F1F5F9"]}
        position={[0, 0.01, 0]}
      />

      {/* Walls */}
      {wallSegments.map((wall, i) => (
        <mesh key={i} position={wall.position as [number, number, number]}>
          <boxGeometry
            args={wall.size as [number, number, number]}
          />
          <meshStandardMaterial color="#E0E7FF" transparent opacity={0.7} />
        </mesh>
      ))}

      {/* Entrance marker */}
      <Text
        position={[0, 0.1, 8.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.5}
        color="#94A3B8"
        anchorX="center"
        anchorY="middle"
        font="https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.woff2"
        fontWeight={500}
      >
        ENTRANCE
      </Text>
    </>
  );
}

const wallSegments = [
  // Outer walls
  { position: [-9, 0.75, 0], size: [0.15, 1.5, 16] }, // left
  { position: [9, 0.75, 0], size: [0.15, 1.5, 16] }, // right
  { position: [0, 0.75, -8], size: [18, 1.5, 0.15] }, // back
  { position: [-4, 0.75, 8], size: [10, 1.5, 0.15] }, // front-left
  { position: [4, 0.75, 8], size: [10, 1.5, 0.15] }, // front-right
  // Internal dividers
  { position: [0, 0.6, -3], size: [0.12, 1.2, 4] }, // center divider top
  { position: [-3, 0.6, 2], size: [6, 1.2, 0.12] }, // horizontal divider left
  { position: [3, 0.6, 2], size: [6, 1.2, 0.12] }, // horizontal divider right
];

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
      {/* Lighting */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 15, 8]} intensity={1} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Gallery */}
      <GalleryFloor />

      {/* Station markers */}
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

      {/* Camera controls */}
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
      <div className="flex flex-1 overflow-hidden">
        {/* 3D Canvas */}
        <div className="flex-1">
          <Canvas
            camera={{
              position: [12, 14, 12],
              fov: 40,
              near: 0.1,
              far: 100,
            }}
            style={{ background: "#F8FAFC" }}
          >
            <Scene selectedId={selectedId} onSelect={handleSelect} />
          </Canvas>
        </div>

        {/* Station info side panel */}
        {selectedStation && (
          <StationInfo
            station={selectedStation}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
