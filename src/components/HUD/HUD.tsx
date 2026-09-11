import { useGameState } from '../../hooks/useGameState';
import './HUD.css';

/** City health is the only persistent overview needed while observing the simulation. */
export function HUD() {
  const state = useGameState();
  const health = state.cityHealth;
  const healthTone = health >= 75 ? 'good' : health >= 40 ? 'warn' : 'bad';
  const runningRuns = state.runs.filter((run) => run.status === 'running').length;
  const failedRuns = state.runs.filter((run) => run.status === 'failed').length;
  const openPullRequests = state.pullRequests.length;

  return (
    <section className="hud panel" aria-label="City overview">
      <div className="hud__heading">
        <h2>City Health</h2>
        <p className={`hud__value hud__value--${healthTone}`}>{health}%</p>
      </div>
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
      <p className="hud__summary">
        {runningRuns} running, {failedRuns} failed, {openPullRequests} open PR{openPullRequests === 1 ? '' : 's'}
      </p>
    </section>
  );
}
