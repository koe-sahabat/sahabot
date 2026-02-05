export interface Station {
  id: string;
  name: string;
  label: string;
  description: string;
  category: string;
  position: { x: number; z: number };
  color: string;
}

export type Screen = "home" | "speak" | "map";

export interface ChatMessage {
  id: string;
  sender: "robot" | "user";
  text: string;
}
