import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas/GameCanvas';
import { HUD } from './components/HUD/HUD';
import { SimBar } from './components/SimBar/SimBar';
import { ActivityFeed } from './components/ActivityFeed/ActivityFeed';
import { DebugPanel } from './components/DebugPanel/DebugPanel';
import { Tooltip } from './components/Tooltip/Tooltip';
import { BuildingPanel } from './components/BuildingPanel/BuildingPanel';
import type { CityScene } from './game/scenes/CityScene';
import type { HoverPayload } from './game/state/hover';
import type { BuildingId } from './game/world/cityLayout';
import { simulation } from './simulation/SimulationEngine';
import './App.css';

export default function App() {
  const [selected, setSelected] = useState<BuildingId | null>(null);
  const [hover, setHover] = useState<HoverPayload | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const sceneRef = useRef<CityScene | null>(null);

  const handleSceneReady = useCallback((scene: CityScene | null) => {
    sceneRef.current = scene;
  }, []);

  // The organization runs itself: no button press is required to see activity.
  useEffect(() => {
    simulation.start();
    return () => simulation.destroy();
  }, []);

  return (
    <div className="app">
      <GameCanvas onSelectionChange={setSelected} onHover={setHover} onSceneReady={handleSceneReady} />

      <div className="app__left">
        <SimBar onToggleDebug={() => setDebugOpen((open) => !open)} debugOpen={debugOpen} />
        {debugOpen && <DebugPanel onResetCamera={() => sceneRef.current?.resetCamera()} />}
      </div>

      <div className="app__right">
        <HUD />
        <ActivityFeed />
        {selected && <BuildingPanel buildingId={selected} onClose={() => setSelected(null)} />}
      </div>

      <Tooltip payload={hover} />

      <footer className="app__hint">Hover a factory or a pull request · Drag to pan · Scroll to zoom</footer>
    </div>
  );
}
