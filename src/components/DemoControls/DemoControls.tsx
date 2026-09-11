import { gameStore } from '../../game/state/gameStore';
import { PRIMARY_PIPELINE_ID } from '../../game/state/gameState';
import './DemoControls.css';

interface Props {
  onResetCamera: () => void;
}

/**
 * Demo-only source of game events. Azure DevOps will later dispatch the exact
 * same events into `gameStore`; nothing else changes.
 */
export function DemoControls({ onResetCamera }: Props) {
  return (
    <section className="demo panel">
      <h2>Demo Controls</h2>
      <button
        className="demo__btn demo__btn--run"
        onClick={() => gameStore.dispatch({ type: 'PIPELINE_STARTED', pipelineId: PRIMARY_PIPELINE_ID })}
      >
        Start Pipeline
      </button>
      <button
        className="demo__btn demo__btn--ok"
        onClick={() => gameStore.dispatch({ type: 'PIPELINE_SUCCEEDED', pipelineId: PRIMARY_PIPELINE_ID })}
      >
        Pipeline Success
      </button>
      <button
        className="demo__btn demo__btn--fail"
        onClick={() => gameStore.dispatch({ type: 'PIPELINE_FAILED', pipelineId: PRIMARY_PIPELINE_ID })}
      >
        Pipeline Failure
      </button>
      <button className="demo__btn" onClick={() => gameStore.dispatch({ type: 'RESET_DEMO' })}>
        Reset Demo
      </button>
      <button className="demo__btn demo__btn--ghost" onClick={onResetCamera}>
        Reset Camera
      </button>
    </section>
  );
}
