import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas/GameCanvas';
import { HUD } from './components/HUD/HUD';
import { SimBar } from './components/SimBar/SimBar';
import { ActivityFeed } from './components/ActivityFeed/ActivityFeed';
import { CityEventsPanel } from './components/CityEventsPanel/CityEventsPanel';
import { EventBanner } from './components/EventBanner/EventBanner';
import { DebugPanel } from './components/DebugPanel/DebugPanel';
import { Tooltip } from './components/Tooltip/Tooltip';
import { BuildingPanel } from './components/BuildingPanel/BuildingPanel';
import { sound } from './audio/SoundManager';
import { cityEvents } from './game/events/CityEventDirector';
import { gameStore } from './game/state/gameStore';
import type { CityScene } from './game/scenes/CityScene';
import type { HoverPayload } from './game/state/hover';
import type { BuildingId } from './game/world/cityLayout';
import { simulation } from './simulation/SimulationEngine';
import type { CityEventId, CityEventSeverity } from './game/state/gameState';
import type { SoundCue } from './audio/SoundManager';
import './App.css';

/** Trouble sounds like trouble: severity alone would celebrate a bug invasion. */
const NEGATIVE_EVENTS: readonly CityEventId[] = ['bug-invasion', 'pr-protest', 'traffic-jam'];

function cueFor(id: CityEventId, severity: CityEventSeverity): SoundCue {
  if (id === 'ufo') return 'ufo';
  if (id === 'tornado') return 'wind';
  if (severity === 'major' || severity === 'chaotic') return 'alarm';
  return NEGATIVE_EVENTS.includes(id) ? 'failure' : 'celebrate';
}

export default function App() {
  const [selected, setSelected] = useState<BuildingId | null>(null);
  const [hover, setHover] = useState<HoverPayload | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const sceneRef = useRef<CityScene | null>(null);

  const handleSceneReady = useCallback((scene: CityScene | null) => {
    sceneRef.current = scene;
  }, []);

  // The organization runs itself, and the city reacts to it. No button needed.
  useEffect(() => {
    simulation.start();
    cityEvents.start();

    // Audio cues ride the same event bus as everything else.
    const offSuccess = gameStore.bus.on('RUN_SUCCEEDED', () => sound.play('success'));
    const offFailure = gameStore.bus.on('RUN_FAILED', () => sound.play('failure'));
    const offEvent = gameStore.bus.on('CITY_EVENT_STARTED', (event) => {
      sound.play(cueFor(event.event.id, event.event.severity));
    });

    return () => {
      offSuccess();
      offFailure();
      offEvent();
      cityEvents.destroy();
      simulation.destroy();
    };
  }, []);

  return (
    <div className="app">
      <GameCanvas onSelectionChange={setSelected} onHover={setHover} onSceneReady={handleSceneReady} />

      <EventBanner onViewEvent={(focus) => sceneRef.current?.focusOnPoint(focus.x, focus.y)} />

      <div className="app__left">
        <SimBar onToggleDebug={() => setDebugOpen((open) => !open)} debugOpen={debugOpen} />
        {debugOpen && <DebugPanel onResetCamera={() => sceneRef.current?.resetCamera()} />}
      </div>

      <div className="app__right">
        <HUD />
        <ActivityFeed />
        <CityEventsPanel />
        {selected && <BuildingPanel buildingId={selected} onClose={() => setSelected(null)} />}
      </div>

      <Tooltip payload={hover} />

      <footer className="app__hint">Hover a factory or a pull request · Drag to pan · Scroll to zoom</footer>
    </div>
  );
}
