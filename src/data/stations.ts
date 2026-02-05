import type { Station } from "../types";

export const stations: Station[] = [
  {
    id: "station-1",
    name: "Station 1",
    label: "1",
    description:
      "Welcome foyer featuring rotating contemporary installations and interactive digital art pieces.",
    category: "Interactive",
    position: { x: -5, z: -5 },
    color: "#6366F1",
  },
  {
    id: "station-2",
    name: "Station 2",
    label: "2",
    description:
      "Classical sculpture gallery showcasing marble and bronze works from regional artists.",
    category: "Sculpture",
    position: { x: 5, z: -5 },
    color: "#8B5CF6",
  },
  {
    id: "station-3",
    name: "Station 3",
    label: "3",
    description:
      "Oil and acrylic painting collection with works spanning the last two decades.",
    category: "Painting",
    position: { x: -5, z: 0 },
    color: "#EC4899",
  },
  {
    id: "station-4",
    name: "Station 4",
    label: "4",
    description:
      "Photography wing with curated exhibitions that change quarterly.",
    category: "Photography",
    position: { x: 5, z: 0 },
    color: "#F59E0B",
  },
  {
    id: "station-5",
    name: "Station 5",
    label: "5",
    description:
      "Multimedia experience room with immersive audio-visual installations.",
    category: "Multimedia",
    position: { x: 0, z: 5 },
    color: "#10B981",
  },
];
