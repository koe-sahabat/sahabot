import { useState, useCallback } from "react";
import type { Screen } from "./types";
import HomeScreen from "./components/HomeScreen";
import SpeakMode from "./components/SpeakMode";
import MapView from "./components/MapView";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");

  const goHome = useCallback(() => setScreen("home"), []);
  const goSpeak = useCallback(() => setScreen("speak"), []);
  const goMap = useCallback(() => setScreen("map"), []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      {screen === "home" && <HomeScreen onSpeak={goSpeak} onMap={goMap} />}
      {screen === "speak" && <SpeakMode onBack={goHome} />}
      {screen === "map" && <MapView onBack={goHome} />}
    </div>
  );
}
