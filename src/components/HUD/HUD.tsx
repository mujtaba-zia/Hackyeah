import {
  STAGES,
  type PipelineStage,
  type PipelineStatus,
  type StageStatus,
} from '../../game/state/gameState';
import { useGameState } from '../../hooks/useGameState';
import './HUD.css';

const PIPELINE_STATUS_LABEL: Record<PipelineStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
};

const STAGE_LABEL: Record<PipelineStage, string> = {
  build: 'Build',
  test: 'Test',
  security: 'Security',
  package: 'Package',
  deploy: 'Deploy',
};

const STAGE_GLYPH: Record<StageStatus, string> = {
  pending: '○',
  running: '▶',
  success: '✅',
  failed: '❌',
};

const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
};

export function HUD() {
  const state = useGameState();
  const { pipeline } = state;
  const health = state.cityHealth;
  const healthTone = health >= 75 ? 'good' : health >= 40 ? 'warn' : 'bad';

  return (
    <section className="hud panel" aria-label="City overview">
      <h2>City Health</h2>
      <div
        className="hud__bar"
        role="progressbar"
        aria-label="City Health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={health}
      >
        <div className={`hud__fill hud__fill--${healthTone}`} style={{ width: `${health}%` }} />
      </div>
      <p className="hud__value">{health}%</p>

      <h2>Pipeline</h2>
      <p className="hud__pipeline">
        <span className={`dot dot--${pipeline.status}`} aria-hidden="true" />
        <span className="hud__pipeline-name">{pipeline.name}</span>
        <span className="hud__pipeline-status">{PIPELINE_STATUS_LABEL[pipeline.status]}</span>
      </p>
      <ol className="hud__stages" aria-label={`${pipeline.name} progress`}>
        {STAGES.map((stage) => {
          const status = pipeline.stages[stage];

          return (
            <li className={`hud__stage hud__stage--${status}`} key={stage}>
              <span className="hud__stage-marker" aria-hidden="true">
                {STAGE_GLYPH[status]}
              </span>
              <span className="hud__stage-name">{STAGE_LABEL[stage]}</span>
              <span className="hud__stage-status">{STAGE_STATUS_LABEL[status]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
