import { getPipeline, type PipelineStatus } from '../../game/state/gameState';
import { useGameState } from '../../hooks/useGameState';
import { KEY_BUILDINGS, type BuildingId } from '../../game/world/cityLayout';
import './BuildingPanel.css';

const STATUS_LABEL: Record<PipelineStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
};

interface Props {
  buildingId: BuildingId;
  onClose: () => void;
}

export function BuildingPanel({ buildingId, onClose }: Props) {
  const state = useGameState();
  const def = KEY_BUILDINGS.find((b) => b.id === buildingId);
  if (!def) return null;

  const pipeline = getPipeline(state);
  const isFactory = buildingId === 'build-factory';

  return (
    <section className="building panel">
      <header className="building__header">
        <h2>{def.name}</h2>
        <button className="building__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {isFactory ? (
        <dl className="building__facts">
          <dt>Status</dt>
          <dd>
            <span className={`dot dot--${pipeline.status}`} />
            {STATUS_LABEL[pipeline.status]}
          </dd>
          <dt>Pipeline</dt>
          <dd>{pipeline.name}</dd>
          <dt>Current Stage</dt>
          <dd>{pipeline.stage}</dd>
        </dl>
      ) : (
        <p className="building__placeholder">{def.description}</p>
      )}

      <button className="building__btn" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
