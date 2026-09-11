import {
  prsForRepo,
  runsForRepo,
  type GameState,
  type PipelineStage,
  type Repository,
} from '../../game/state/gameState';
import { useGameState } from '../../hooks/useGameState';
import { KEY_BUILDINGS, type BuildingId } from '../../game/world/cityLayout';
import './BuildingPanel.css';

const STAGE_BY_BUILDING: Readonly<Partial<Record<BuildingId, PipelineStage>>> = {
  'build-factory': 'build',
  'test-lab': 'test',
  'security-hub': 'security',
  'packaging-station': 'package',
  'deployment-port': 'deploy',
};

const STAGE_LABEL: Record<PipelineStage, string> = {
  build: 'Build',
  test: 'Test',
  security: 'Security',
  package: 'Package',
  deploy: 'Deploy',
};

interface Props {
  buildingId: BuildingId;
  onClose: () => void;
}

interface RepositoryDetailsProps {
  state: GameState;
  repository: Repository;
}

function RepositoryDetails({ state, repository }: RepositoryDetailsProps) {
  const history = state.history[repository.id];
  const activeRuns = runsForRepo(state, repository.id).filter((run) => run.status === 'running');
  const pipelineHealth =
    history.length === 0
      ? 100
      : Math.round((history.filter((entry) => entry.status === 'success').length / history.length) * 100);
  const healthTone = pipelineHealth >= 75 ? 'good' : pipelineHealth >= 40 ? 'warn' : 'bad';
  const openPullRequests = prsForRepo(state, repository.id).length;

  return (
    <section className="building__repository">
      <div className="building__repository-heading">
        <h3>{repository.name}</h3>
        <span className={`building__health building__health--${healthTone}`}>{pipelineHealth}%</span>
      </div>
      <p className="building__repository-meta">
        {openPullRequests} open PR{openPullRequests === 1 ? '' : 's'}
      </p>

      <h4>Active runs</h4>
      {activeRuns.length === 0 ? (
        <p className="building__empty">No active runs</p>
      ) : (
        <ul className="building__runs">
          {activeRuns.map((run) => (
            <li key={run.id}>
              <span>{run.name} #{run.number}</span>
              <span>{STAGE_LABEL[run.stage]}</span>
            </li>
          ))}
        </ul>
      )}

      <h4>Recent history</h4>
      {history.length === 0 ? (
        <p className="building__empty">No completed runs</p>
      ) : (
        <ul className="building__history">
          {history.slice(0, 3).map((entry) => (
            <li className={`building__history-entry building__history-entry--${entry.status}`} key={`${entry.number}-${entry.endedAtSim}`}>
              <span>{entry.name} #{entry.number}</span>
              <strong>{entry.status === 'success' ? 'Passed' : 'Failed'}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Shows a landmark description with the live work represented by that building. */
export function BuildingPanel({ buildingId, onClose }: Props) {
  const state = useGameState();
  const definition = KEY_BUILDINGS.find((building) => building.id === buildingId);
  const repositories = state.repositories.filter((repository) => repository.factory === buildingId);
  const stage = STAGE_BY_BUILDING[buildingId];
  const activeStageRuns = stage
    ? state.runs.filter((run) => run.status === 'running' && run.stage === stage).length
    : 0;
  const waitingPullRequests = state.pullRequests.filter((pr) => pr.status === 'waiting').length;
  const changesRequested = state.pullRequests.filter((pr) => pr.status === 'changes-requested').length;
  const approvedPullRequests = state.pullRequests.filter((pr) => pr.status === 'approved').length;
  const updatingPullRequests = state.pullRequests.filter((pr) => pr.status === 'updating').length;

  if (!definition) return null;

  return (
    <section className="building panel" aria-labelledby={`building-${buildingId}-title`}>
      <header className="building__header">
        <h2 id={`building-${buildingId}-title`}>{definition.name}</h2>
        <button type="button" className="building__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <dl className="building__facts">
        <div>
          <dt>District</dt>
          <dd className="building__district">{definition.district}</dd>
        </div>
        {stage ? (
          <div>
            <dt>{STAGE_LABEL[stage]} stage</dt>
            <dd>
              {activeStageRuns} active run{activeStageRuns === 1 ? '' : 's'}
            </dd>
          </div>
        ) : null}
        {buildingId === 'review-hall' ? (
          <>
            <div>
              <dt>Waiting PRs</dt>
              <dd>{waitingPullRequests}</dd>
            </div>
            <div>
              <dt>Changes requested</dt>
              <dd>{changesRequested}</dd>
            </div>
          </>
        ) : null}
        {buildingId === 'merge-gate' ? (
          <>
            <div>
              <dt>Ready to merge</dt>
              <dd>{approvedPullRequests}</dd>
            </div>
            <div>
              <dt>Updating</dt>
              <dd>{updatingPullRequests}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <p className="building__description">{definition.description}</p>

      {repositories.length > 0 ? (
        <div className="building__repositories">
          <h3>Repositories</h3>
          {repositories.map((repository) => (
            <RepositoryDetails key={repository.id} state={state} repository={repository} />
          ))}
        </div>
      ) : null}

      <button type="button" className="building__btn" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
