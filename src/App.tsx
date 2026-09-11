import { useCallback, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas/GameCanvas';
import { HUD } from './components/HUD/HUD';
import { DemoControls } from './components/DemoControls/DemoControls';
import { BuildingPanel } from './components/BuildingPanel/BuildingPanel';
import type { CityScene } from './game/scenes/CityScene';
import type { BuildingId } from './game/world/cityLayout';
import './App.css';

export default function App() {
  const [selected, setSelected] = useState<BuildingId | null>(null);
  const sceneRef = useRef<CityScene | null>(null);

  const handleSceneReady = useCallback((scene: CityScene | null) => {
    sceneRef.current = scene;
  }, []);

  return (
    <div className="app">
      <GameCanvas onSelectionChange={setSelected} onSceneReady={handleSceneReady} />

      <header className="app__title">
        Living City <span>· Milestone 1</span>
      </header>

      <div className="app__left">
        <DemoControls onResetCamera={() => sceneRef.current?.resetCamera()} />
      </div>

      <div className="app__right">
        <HUD />
        {selected && <BuildingPanel buildingId={selected} onClose={() => setSelected(null)} />}
      </div>

      <footer className="app__hint">Drag to pan · Scroll to zoom · WASD / arrows to move · Click a landmark</footer>
    </div>
  );
}
