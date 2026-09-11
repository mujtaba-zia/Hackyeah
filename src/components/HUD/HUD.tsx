import { getPipeline, type PipelineStatus } from '../../game/state/gameState';
import { useGameState } from '../../hooks/useGameState';
import './HUD.css';

const STATUS_LABEL: Record<PipelineStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
};

export function HUD() {
  const state = useGameState();
  const pipeline = getPipeline(state);
  const health = state.cityHealth;
  const healthTone = health >= 75 ? 'good' : health >= 40 ? 'warn' : 'bad';

  return (
    <section className="hud panel">
      <h2>City Health</h2>
      <div className="hud__bar">
        <div className={`hud__fill hud__fill--${healthTone}`} style={{ width: `${health}%` }} />
      </div>
      <div className="hud__value">{health}%</div>

      <h2>Pipeline</h2>
      <div className="hud__pipeline">
        <span className={`dot dot--${pipeline.status}`} />
        <span>
          {pipeline.name} · {STATUS_LABEL[pipeline.status]}
        </span>
      </div>
    </section>
  );
}
