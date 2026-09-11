import { gameStore } from '../../game/state/gameStore';
import { simulation } from '../../simulation/SimulationEngine';
import { useGameState } from '../../hooks/useGameState';
import './DebugPanel.css';

const SPEEDS = [1, 2, 4] as const;

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
    </section>
  );
}
