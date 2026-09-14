import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  prAgeHours,
  type GameState,
  type PipelineRun,
  type PipelineStage,
  type PrStatus,
  type PullRequest,
  type Repository,
  type RunHistoryEntry,
} from '../../game/state/gameState';
import type { HoverPayload } from '../../game/state/hover';
import { CITIES, LANDMARKS, type BuildingId, type LandmarkKind } from '../../three/world/cityPlan';
import { useGameState } from '../../hooks/useGameState';
import './Tooltip.css';

const TOOLTIP_GAP = 10;
const CURSOR_OFFSET = 14;
const FALLBACK_TOOLTIP_WIDTH = 280;

const STAGE_LABEL: Record<PipelineStage, string> = {
  build: 'Build',
  test: 'Test',
  security: 'Security',
  package: 'Package',
  deploy: 'Deploy',
};

const PR_STATUS_LABEL: Record<PrStatus, string> = {
  waiting: 'Waiting',
  'changes-requested': 'Changes requested',
  updating: 'Updating',
  approved: 'Approved',
  merged: 'Merged',
};

interface Viewport {
  width: number;
  height: number;
}

interface Position {
  left: number;
  top: number;
}

interface RepositorySummaryProps {
  repository: Repository;
  runs: PipelineRun[];
  history: readonly RunHistoryEntry[];
  pullRequestCount: number;
}

function getViewport(): Viewport {
  if (typeof window === 'undefined') {
    return { width: FALLBACK_TOOLTIP_WIDTH + TOOLTIP_GAP * 2, height: TOOLTIP_GAP * 2 + 1 };
  }

  return { width: window.innerWidth, height: window.innerHeight };
}

function clampCoordinate(value: number, itemSize: number, viewportSize: number): number {
  const furthestPosition = Math.max(TOOLTIP_GAP, viewportSize - itemSize - TOOLTIP_GAP);
  return Math.min(Math.max(TOOLTIP_GAP, value), furthestPosition);
}

function clampPosition(payload: HoverPayload, width: number, height: number, viewport: Viewport): Position {
  return {
    left: clampCoordinate(payload.x + CURSOR_OFFSET, width, viewport.width),
    top: clampCoordinate(payload.y + CURSOR_OFFSET, height, viewport.height),
  };
}

function formatAge(hours: number): string {
  const wholeHours = Math.max(0, Math.floor(hours));
  const days = Math.floor(wholeHours / 24);
  const remainingHours = wholeHours % 24;

  return `${days}d ${remainingHours}h`;
}

function pipelineHealth(history: readonly RunHistoryEntry[]): number {
  if (history.length === 0) return 100;

  const successful = history.filter((entry) => entry.status === 'success').length;
  return Math.round((successful / history.length) * 100);
}

function healthTone(value: number): 'good' | 'warn' | 'bad' {
  if (value >= 75) return 'good';
  if (value >= 40) return 'warn';
  return 'bad';
}

function progressPercent(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

function RepositorySummary({ repository, runs, history, pullRequestCount }: RepositorySummaryProps) {
  const health = pipelineHealth(history);

  return (
    <section className="tooltip__repository">
      <div className="tooltip__repository-heading">
        <h3>{repository.name}</h3>
        <span className={`tooltip__health tooltip__health--${healthTone(health)}`}>{health}%</span>
      </div>

      <div className="tooltip__subheading">Active pipelines</div>
      {runs.length === 0 ? (
        <p className="tooltip__empty">No active runs</p>
      ) : (
        <ul className="tooltip__runs">
          {runs.map((run) => {
            const progress = progressPercent(run.progress);

            return (
              <li className="tooltip__run" key={run.id}>
                <div className="tooltip__run-meta">
                  <span>{run.name} #{run.number}</span>
                  <span>{STAGE_LABEL[run.stage]}</span>
                </div>
                <div
                  className="tooltip__progress"
                  role="progressbar"
                  aria-label={`${run.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <div className="tooltip__progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="tooltip__subheading">Recent history</div>
      {history.length === 0 ? (
        <p className="tooltip__empty">No completed runs</p>
      ) : (
        <ul className="tooltip__history">
          {history.slice(0, 3).map((entry) => (
            <li className={`tooltip__history-entry tooltip__history-entry--${entry.status}`} key={`${entry.number}-${entry.endedAtSim}`}>
              <span>{entry.name} #{entry.number}</span>
              <strong>{entry.status === 'success' ? 'Passed' : 'Failed'}</strong>
            </li>
          ))}
        </ul>
      )}

      <p className="tooltip__pr-count">
        {pullRequestCount} open PR{pullRequestCount === 1 ? '' : 's'}
      </p>
    </section>
  );
}

/** Which shared pipeline stage each landmark kind hosts. */
const STAGE_OF_KIND: Partial<Record<LandmarkKind, string>> = {
  build: 'build',
  test: 'test',
  security: 'security',
  package: 'package',
  port: 'deploy',
};

function FactoryTooltip({ state, buildingId }: { state: GameState; buildingId: BuildingId }) {
  const repositories = state.repositories.filter((repository) => repository.factory === buildingId);
  const building = LANDMARKS.find((candidate) => candidate.id === buildingId);

  // Landmarks that host a shared pipeline stage, Review Hall and the Merge Gate
  // are not repository factories, but hovering them must still explain them.
  if (repositories.length === 0) {
    if (!building) return null;
    const stageRuns = state.runs.filter(
      (run) => run.status === 'running' && STAGE_OF_KIND[building.kind] === run.stage,
    );
    return (
      <>
        <h2>{building.name}</h2>
        <p className="tooltip__intro">{CITIES.find((c) => c.id === building.city)?.name ?? building.city}</p>
        <p className="tooltip__pr-title">{building.description}</p>
        <dl className="tooltip__facts">
          <div>
            <dt>Active here</dt>
            <dd>
              {stageRuns.length} run{stageRuns.length === 1 ? '' : 's'}
            </dd>
          </div>
          <div>
            <dt>Open PRs</dt>
            <dd>{state.pullRequests.length}</dd>
          </div>
        </dl>
      </>
    );
  }

  return (
    <>
      <h2>{building?.name ?? 'Repository Factory'}</h2>
      <p className="tooltip__intro">
        {repositories.length === 1 ? repositories[0].name : `${repositories.length} repositories`}
      </p>
      {repositories.map((repository) => (
        <RepositorySummary
          key={repository.id}
          repository={repository}
          runs={state.runs.filter((run) => run.repoId === repository.id && run.status === 'running')}
          history={state.history[repository.id]}
          pullRequestCount={state.pullRequests.filter((pr) => pr.repoId === repository.id).length}
        />
      ))}
    </>
  );
}

function PullRequestTooltip({ state, pr }: { state: GameState; pr: PullRequest | null }) {
  if (!pr) return null;

  const repository = state.repositories.find((candidate) => candidate.id === pr.repoId);

  if (!repository) return null;

  return (
    <>
      <h2>PR #{pr.number}</h2>
      <p className="tooltip__intro">{repository.name}</p>
      <p className="tooltip__pr-title">{pr.title}</p>
      <dl className="tooltip__facts">
        <div>
          <dt>Age</dt>
          <dd>{formatAge(prAgeHours(pr, state.sim.time))}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={`tooltip__status tooltip__status--${pr.status}`}>{PR_STATUS_LABEL[pr.status]}</dd>
        </div>
        <div>
          <dt>Reviewers</dt>
          <dd>{pr.reviewers}</dd>
        </div>
      </dl>
    </>
  );
}

function PullRequestGroupTooltip({ state, payload }: { state: GameState; payload: Extract<HoverPayload, { kind: 'pr-group' }> }) {
  const repository = state.repositories.find((candidate) => candidate.id === payload.repoId);
  const pullRequests = state.pullRequests.filter(
    (pr) => pr.repoId === payload.repoId && payload.prIds.includes(pr.id),
  );

  if (!repository || pullRequests.length === 0) return null;

  const ages = pullRequests.map((pr) => prAgeHours(pr, state.sim.time));
  const oldestAge = Math.max(...ages);
  const averageAge = ages.reduce((total, age) => total + age, 0) / ages.length;
  const waiting = pullRequests.filter((pr) => pr.status === 'waiting').length;
  const changesRequested = pullRequests.filter((pr) => pr.status === 'changes-requested').length;

  return (
    <>
      <h2>{repository.name}</h2>
      <p className="tooltip__intro">
        {pullRequests.length} grouped PR{pullRequests.length === 1 ? '' : 's'}
      </p>
      <dl className="tooltip__facts">
        <div>
          <dt>Oldest</dt>
          <dd>{formatAge(oldestAge)}</dd>
        </div>
        <div>
          <dt>Average age</dt>
          <dd>{formatAge(averageAge)}</dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd>{waiting}</dd>
        </div>
        <div>
          <dt>Changes requested</dt>
          <dd>{changesRequested}</dd>
        </div>
      </dl>
    </>
  );
}

/** Pointer-bound details are measured before paint so they stay inside the viewport. */
export function Tooltip({ payload }: { payload: HoverPayload | null }) {
  const state = useGameState();
  const elementRef = useRef<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(getViewport);
  const [position, setPosition] = useState<Position>({ left: TOOLTIP_GAP, top: TOOLTIP_GAP });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateViewport = () => setViewport(getViewport());
    window.addEventListener('resize', updateViewport);

    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useLayoutEffect(() => {
    if (!payload) return;

    const rect = elementRef.current?.getBoundingClientRect();
    const nextPosition = clampPosition(
      payload,
      rect?.width ?? FALLBACK_TOOLTIP_WIDTH,
      rect?.height ?? 0,
      viewport,
    );

    setPosition((previousPosition) =>
      previousPosition.left === nextPosition.left && previousPosition.top === nextPosition.top
        ? previousPosition
        : nextPosition,
    );
  }, [payload, state, viewport]);

  if (!payload) return null;

  let content: ReactNode;

  if (payload.kind === 'factory') {
    // Stage sites, Review Hall and the Merge Gate are landmarks without a
    // repository, and they still deserve a card.
    content = <FactoryTooltip state={state} buildingId={payload.buildingId} />;
  } else if (payload.kind === 'pr') {
    const pullRequest = state.pullRequests.find((pr) => pr.id === payload.prId);
    if (!pullRequest) return null;
    content = <PullRequestTooltip state={state} pr={pullRequest} />;
  } else {
    const hasPullRequests = state.pullRequests.some(
      (pr) => pr.repoId === payload.repoId && payload.prIds.includes(pr.id),
    );
    if (!hasPullRequests) return null;
    content = <PullRequestGroupTooltip state={state} payload={payload} />;
  }

  return (
    <aside
      className="tooltip"
      ref={elementRef}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
    >
      {content}
    </aside>
  );
}
