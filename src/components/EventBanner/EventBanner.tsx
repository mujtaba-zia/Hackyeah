import { useEffect, useState } from 'react';
import { useGameState } from '../../hooks/useGameState';
import type { ActiveCityEvent } from '../../game/state/gameState';
import './EventBanner.css';

const ICON: Record<string, string> = {
  tornado: 'TORNADO',
  ufo: 'UFO',
  'bug-invasion': 'BUGS',
  'factory-fire': 'FIRE',
  'pr-protest': 'PROTEST',
  'deployment-parade': 'PARADE',
  blackout: 'BLACKOUT',
  'traffic-jam': 'TRAFFIC',
  meteor: 'METEOR',
  fireworks: 'FIREWORKS',
  rainbow: 'RAINBOW',
  'construction-boom': 'BUILD',
  'repair-crew': 'REPAIRS',
};

interface Props {
  onViewEvent: (focus: { x: number; y: number }) => void;
}

/** Transient headline for the newest city event. Never blocks the city view. */
export function EventBanner({ onViewEvent }: Props) {
  const state = useGameState();
  const newest: ActiveCityEvent | undefined = state.cityEvents.active[0];
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Auto hide a few seconds in, while the event itself keeps running.
  useEffect(() => {
    if (!newest) return;
    const key = `${newest.id}-${newest.startedAtSim}`;
    setDismissed(null);
    const timer = setTimeout(() => setDismissed(key), 6500);
    return () => clearTimeout(timer);
  }, [newest?.id, newest?.startedAtSim]);

  if (!newest) return null;
  if (dismissed === `${newest.id}-${newest.startedAtSim}`) return null;

  return (
    <div className={`banner banner--${newest.severity}`} role="status">
      <span className="banner__tag">{ICON[newest.id] ?? 'EVENT'}</span>
      <div className="banner__body">
        <strong>{newest.name}</strong>
        <span>{newest.blurb}</span>
      </div>
      {newest.focus && (
        <button className="banner__view" onClick={() => onViewEvent(newest.focus!)}>
          View Event
        </button>
      )}
    </div>
  );
}
