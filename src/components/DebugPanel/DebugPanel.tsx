import { gameStore } from '../../game/state/gameStore';
import { cityEvents } from '../../game/events/CityEventDirector';
import type { CityEventId } from '../../game/state/gameState';
import { simulation } from '../../simulation/SimulationEngine';
import { useGameState } from '../../hooks/useGameState';
import './DebugPanel.css';

const SPEEDS = [1, 2, 4] as const;

const FORCEABLE: readonly CityEventId[] = [
  'tornado',
  'ufo',
  'bug-invasion',
  'factory-fire',
  'pr-protest',
  'deployment-parade',
  'blackout',
  'traffic-jam',
  'meteor',
  'fireworks',
  'rainbow',
  'construction-boom',
  'repair-crew',
];

interface Props {
  onResetCamera: () => void;
}

/** Developer-only simulation hooks stay out of the normal observation surface. */
export function DebugPanel({ onResetCamera }: Props) {
  const { followCamera, sim } = useGameState();

  return (
    <section className="debug-panel panel" aria-labelledby="debug-panel-title">
      <h2 id="debug-panel-title">Developer Controls</h2>
      <div className="debug-panel__actions">
        <button
          type="button"
          className="debug-panel__button debug-panel__button--failure"
          onClick={() => simulation.triggerFailure()}
        >
          Trigger Failure
        </button>
        <button
          type="button"
          className="debug-panel__button"
          onClick={() => simulation.createPullRequest()}
        >
          Create PR
        </button>
        <button
          type="button"
          className="debug-panel__button"
          onClick={() => simulation.triggerDeployment()}
        >
          Trigger Deployment
        </button>
        <button
          type="button"
          className="debug-panel__button debug-panel__button--reset"
          onClick={() => simulation.reset()}
        >
          Reset Simulation
        </button>
      </div>

      <div className="debug-panel__speed-row">
        <span className="debug-panel__label">Speed</span>
        <div className="debug-panel__speeds" role="group" aria-label="Simulation speed">
          {SPEEDS.map((speed) => (
            <button
              type="button"
              className="debug-panel__speed"
              key={speed}
              aria-pressed={sim.speed === speed}
              onClick={() => simulation.setSpeed(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="debug-panel__button debug-panel__button--follow"
        aria-pressed={followCamera}
        onClick={() => gameStore.dispatch({ type: 'SET_FOLLOW_CAMERA', follow: !followCamera })}
      >
        Follow Camera: {followCamera ? 'On' : 'Off'}
      </button>
      <button
        type="button"
        className="debug-panel__button debug-panel__button--ghost"
        onClick={onResetCamera}
      >
        Reset Camera
      </button>

      <span className="debug-panel__label">Force Event</span>
      <div className="debug-panel__events">
        {FORCEABLE.map((id) => (
          <button
            type="button"
            key={id}
            className="debug-panel__event"
            onClick={() => cityEvents.force(id)}
          >
            {id.replace(/-/g, ' ')}
          </button>
        ))}
      </div>


    </section>
  );
}
