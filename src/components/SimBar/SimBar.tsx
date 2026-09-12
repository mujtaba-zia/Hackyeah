import { useState } from 'react';
import { sound } from '../../audio/SoundManager';
import { simulation } from '../../simulation/SimulationEngine';
import { useGameState } from '../../hooks/useGameState';
import './SimBar.css';

const SPEEDS = [1, 2, 4] as const;
const MINUTES_PER_DAY = 24 * 60;

interface Props {
  onToggleDebug: () => void;
  debugOpen: boolean;
}

function formatClock(time: number): string {
  const totalMinutes = Math.max(0, Math.floor(time));
  const day = Math.floor(totalMinutes / MINUTES_PER_DAY) + 1;
  const minutesToday = totalMinutes % MINUTES_PER_DAY;
  const hours = Math.floor(minutesToday / 60).toString().padStart(2, '0');
  const minutes = (minutesToday % 60).toString().padStart(2, '0');

  return `Day ${day} ${hours}:${minutes}`;
}

/** Compact controls keep simulation status visible without competing with the city. */
export function SimBar({ onToggleDebug, debugOpen }: Props) {
  const { sim } = useGameState();
  // Audio starts muted because browsers block autoplay, so the only way to ever
  // hear the city is a control on the normal observation surface.
  const [muted, setMuted] = useState(sound.isMuted);

  return (
    <section className="sim-bar panel" aria-label="Simulation controls">
      <div className="sim-bar__status" role="status">
        <span
          className={`dot sim-bar__dot ${sim.running ? 'sim-bar__dot--live' : 'sim-bar__dot--paused'}`}
          aria-hidden="true"
        />
        <strong>{sim.running ? 'LIVE' : 'PAUSED'}</strong>
        <time className="sim-bar__clock">{formatClock(sim.time)}</time>
      </div>

      <div className="sim-bar__speeds" role="group" aria-label="Simulation speed">
        {SPEEDS.map((speed) => (
          <button
            type="button"
            className="sim-bar__speed"
            key={speed}
            aria-pressed={sim.speed === speed}
            onClick={() => simulation.setSpeed(speed)}
          >
            {speed}x
          </button>
        ))}
      </div>

      <button
        type="button"
        className="sim-bar__run-toggle"
        onClick={() => simulation.setRunning(!sim.running)}
      >
        {sim.running ? 'Pause' : 'Resume'}
      </button>
      <button
        type="button"
        className="sim-bar__speed"
        aria-pressed={!muted}
        title={muted ? 'Unmute city sounds' : 'Mute city sounds'}
        onClick={() => {
          sound.setMuted(!sound.isMuted);
          setMuted(sound.isMuted);
        }}
      >
        {muted ? 'Muted' : 'Sound'}
      </button>
      {!muted && (
        <input
          className="sim-bar__volume"
          type="range"
          min={0}
          max={100}
          defaultValue={Math.round(sound.level * 100)}
          aria-label="Volume"
          onChange={(event) => sound.setVolume(Number(event.target.value) / 100)}
        />
      )}
      <button
        type="button"
        className="sim-bar__debug-toggle"
        aria-label="Toggle developer controls"
        aria-pressed={debugOpen}
        title="Developer controls"
        onClick={onToggleDebug}
      >
        <span aria-hidden="true">⚙</span>
      </button>
    </section>
  );
}
