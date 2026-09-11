import { gameStore } from '../../game/state/gameStore';
import { STAGES, type PipelineStage } from '../../game/state/gameState';
import { useGameState } from '../../hooks/useGameState';
import './DemoControls.css';

const STAGE_LABEL: Record<PipelineStage, string> = {
  build: 'Build',
  test: 'Test',
  security: 'Security',
  package: 'Package',
  deploy: 'Deploy',
};

interface Props {
  onResetCamera: () => void;
}

/** Controls for the local pipeline presentation. */
export function DemoControls({ onResetCamera }: Props) {
  const state = useGameState();
  const { pipeline } = state;
  const currentStage = pipeline.currentStage;
  const canFailCurrentStage =
    currentStage !== null && pipeline.stages[currentStage] === 'running';

  return (
    <section className="demo panel">
      <h2>Demo Controls</h2>
      <button
        type="button"
        className="demo__btn demo__btn--run"
        disabled={pipeline.status === 'running'}
        onClick={() => gameStore.dispatch({ type: 'PIPELINE_STARTED' })}
      >
        Run Full Pipeline
      </button>
      <button
        type="button"
        className="demo__btn demo__btn--fail"
        disabled={!canFailCurrentStage}
        onClick={() => {
          if (currentStage !== null) {
            gameStore.dispatch({ type: 'PIPELINE_STAGE_FAILED', stage: currentStage });
          }
        }}
      >
        Fail Current Stage
      </button>
      <label className="demo__field" htmlFor="demo-fail-at">
        <span>Fail At</span>
        <select
          id="demo-fail-at"
          className="demo__select"
          value={pipeline.failAt ?? ''}
          onChange={(event) => {
            const stage = STAGES.find((candidate) => candidate === event.target.value) ?? null;
            gameStore.dispatch({ type: 'SET_FAIL_STAGE', stage });
          }}
        >
          <option value="">None</option>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABEL[stage]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="demo__btn demo__btn--toggle"
        aria-pressed={state.followCamera}
        onClick={() =>
          gameStore.dispatch({ type: 'SET_FOLLOW_CAMERA', follow: !state.followCamera })
        }
      >
        Follow Pipeline: {state.followCamera ? 'On' : 'Off'}
      </button>
      <button
        type="button"
        className="demo__btn"
        onClick={() => gameStore.dispatch({ type: 'PIPELINE_RESET' })}
      >
        Reset Demo
      </button>
      <button type="button" className="demo__btn demo__btn--ghost" onClick={onResetCamera}>
        Reset Camera
      </button>
    </section>
  );
}
