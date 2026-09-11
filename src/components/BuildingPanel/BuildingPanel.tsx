import {
  STAGES,
  STAGE_BUILDING,
  type PipelineStage,
  type StageStatus,
} from '../../game/state/gameState';
import { useGameState } from '../../hooks/useGameState';
import { KEY_BUILDINGS, type BuildingId } from '../../game/world/cityLayout';
import './BuildingPanel.css';

const STAGE_LABEL: Record<PipelineStage, string> = {
  build: 'Build',
  test: 'Test',
  security: 'Security',
  package: 'Package',
  deploy: 'Deploy',
};

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Pending',
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
  const def = KEY_BUILDINGS.find((building) => building.id === buildingId);
  const stage = STAGES.find((candidate) => STAGE_BUILDING[candidate] === buildingId);

  if (!def) return null;

  return (
    <section className="building panel" aria-labelledby={`building-${buildingId}-title`}>
      <header className="building__header">
        <h2 id={`building-${buildingId}-title`}>{def.name}</h2>
        <button type="button" className="building__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <dl className="building__facts">
        <dt>District</dt>
        <dd className="building__district">{def.district}</dd>
        {stage ? (
          <>
            <dt>Pipeline Stage</dt>
            <dd>{STAGE_LABEL[stage]}</dd>
            <dt>Stage Status</dt>
            <dd>
              <span className={`dot dot--${state.pipeline.stages[stage]}`} aria-hidden="true" />
              {STATUS_LABEL[state.pipeline.stages[stage]]}
            </dd>
          </>
        ) : null}
      </dl>

      <p className="building__description">{def.description}</p>
      <button type="button" className="building__btn" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
