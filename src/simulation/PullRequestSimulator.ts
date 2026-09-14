import type { GameEvent } from '../game/systems/events';
import { REPOSITORIES } from '../game/state/gameState';
import type { PrStatus, PullRequest } from '../game/state/gameState';
import { pick, pickWeighted, PR_TITLES, randomInt } from './MockData';

const MIN_OPEN_PULL_REQUESTS = 6;
const MAX_OPEN_PULL_REQUESTS = 14;
// Review traffic slowed to match: a new pull request every 45 to 110 real
// seconds, and reviews that take a believable while to come back.
const MIN_CREATION_DELAY = 90;
const MAX_CREATION_DELAY = 220;
const MIN_CREATION_RETRY_DELAY = 45;
const MAX_CREATION_RETRY_DELAY = 90;
const MIN_REVIEW_DELAY = 260;
const MAX_REVIEW_DELAY = 520;
const MIN_CHANGES_DELAY = 60;
const MAX_CHANGES_DELAY = 120;
const MIN_UPDATE_DELAY = 90;
const MAX_UPDATE_DELAY = 180;
const MIN_MERGE_DELAY = 35;
const MAX_MERGE_DELAY = 70;
const MAX_EVENTS_PER_TICK = 64;

type Dispatch = (event: GameEvent) => void;
type ReviewStatus = 'approved' | 'changes-requested';

interface ManagedPullRequest {
  pr: PullRequest;
  nextActionAt: number;
}

/** Drives review state from simulated time so pause and speed changes apply everywhere. */
export class PullRequestSimulator {
  private readonly dispatch: Dispatch;
  private readonly rng: () => number;
  private readonly pullRequests = new Map<string, ManagedPullRequest>();
  private nextPullRequestNumber = 180;
  private nextCreationAt = 0;
  private lastCreationAt = -MIN_CREATION_DELAY;

  constructor(dispatch: Dispatch, rng: () => number) {
    this.dispatch = dispatch;
    this.rng = rng;
  }

  createStartup(simTime: number): PullRequest[] {
    this.pullRequests.clear();
    this.lastCreationAt = simTime - MIN_CREATION_DELAY;
    this.nextPullRequestNumber = 176 + randomInt(this.rng, 0, 15);

    const ages = [15, 80, 260, 600, 1_080, 1_720, 2_480, 3_380, 4_320];
    const statuses: readonly PrStatus[] = [
      'waiting',
      'waiting',
      'waiting',
      'changes-requested',
      'waiting',
      'updating',
      'waiting',
      'approved',
      'waiting',
    ];

    for (let index = 0; index < ages.length; index += 1) {
      const pr = this.makePullRequest(simTime - ages[index]!);
      const status = statuses[index]!;
      const nextActionAt = simTime + 18 + index * 24 + randomInt(this.rng, 0, 8);
      pr.status = status;
      this.pullRequests.set(pr.id, { pr, nextActionAt });
    }

    this.nextCreationAt = simTime + randomInt(this.rng, MIN_CREATION_DELAY, MAX_CREATION_DELAY);
    return [...this.pullRequests.values()].map(({ pr }) => ({ ...pr }));
  }

  tick(simTime: number): void {
    let processedEvents = 0;

    while (processedEvents < MAX_EVENTS_PER_TICK) {
      const action = this.nextDueAction(simTime);
      const actionAt = action?.nextActionAt ?? Number.POSITIVE_INFINITY;
      const creationAt = this.nextCreationAt <= simTime
        ? this.nextCreationAt
        : Number.POSITIVE_INFINITY;
      const nextAt = Math.min(actionAt, creationAt);

      if (!Number.isFinite(nextAt)) return;

      if (action !== null && actionAt <= creationAt) {
        this.processAction(action, simTime);
      } else {
        this.createScheduledPullRequest(simTime);
      }

      processedEvents += 1;
    }
  }

  createPullRequest(simTime: number): void {
    if (this.pullRequests.size >= MAX_OPEN_PULL_REQUESTS) return;

    this.createPullRequestAt(simTime);
  }

  destroy(): void {
    this.pullRequests.clear();
  }

  private makePullRequest(createdAtSim: number): PullRequest {
    const repoId = pick(this.rng, REPOSITORIES).id;
    const number = this.nextPullRequestNumber;
    this.nextPullRequestNumber += 1;

    return {
      id: `pr-${number}`,
      number,
      repoId,
      title: pick(this.rng, PR_TITLES),
      status: 'waiting',
      createdAtSim,
      reviewers: randomInt(this.rng, 1, 3),
    };
  }

  private nextDueAction(simTime: number): ManagedPullRequest | null {
    let next: ManagedPullRequest | null = null;

    for (const managed of this.pullRequests.values()) {
      if (managed.nextActionAt > simTime) continue;
      if (next === null || managed.nextActionAt < next.nextActionAt) next = managed;
    }

    return next;
  }

  private processAction(managed: ManagedPullRequest, simTime: number): void {
    switch (managed.pr.status) {
      case 'waiting': {
        const status = pickWeighted<ReviewStatus>(this.rng, [
          { value: 'approved', weight: 7 },
          { value: 'changes-requested', weight: 3 },
        ]);
        this.changeStatus(managed, status);
        managed.nextActionAt = simTime + (status === 'approved'
          ? randomInt(this.rng, MIN_MERGE_DELAY, MAX_MERGE_DELAY)
          : randomInt(this.rng, MIN_CHANGES_DELAY, MAX_CHANGES_DELAY));
        return;
      }
      case 'changes-requested':
        this.changeStatus(managed, 'updating');
        managed.nextActionAt = simTime + randomInt(this.rng, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);
        return;
      case 'updating':
        this.changeStatus(managed, 'waiting');
        managed.nextActionAt = simTime + randomInt(this.rng, MIN_REVIEW_DELAY, MAX_REVIEW_DELAY);
        return;
      case 'approved':
        if (
          this.pullRequests.size <= MIN_OPEN_PULL_REQUESTS
          && simTime < this.lastCreationAt + MIN_CREATION_DELAY
        ) {
          managed.nextActionAt = this.lastCreationAt + MIN_CREATION_DELAY;
          return;
        }
        if (this.pullRequests.size <= MIN_OPEN_PULL_REQUESTS) {
          this.createPullRequestAt(simTime);
          this.nextCreationAt = simTime + randomInt(
            this.rng,
            MIN_CREATION_DELAY,
            MAX_CREATION_DELAY,
          );
        }
        this.dispatch({ type: 'PR_MERGED', prId: managed.pr.id });
        this.pullRequests.delete(managed.pr.id);
        return;
      case 'merged':
        return;
    }
  }

  private changeStatus(managed: ManagedPullRequest, status: PrStatus): void {
    managed.pr.status = status;
    this.dispatch({ type: 'PR_STATUS_CHANGED', prId: managed.pr.id, status });
  }

  private createScheduledPullRequest(simTime: number): void {
    if (this.pullRequests.size < MAX_OPEN_PULL_REQUESTS) {
      this.createPullRequestAt(simTime);
      this.nextCreationAt = simTime + randomInt(this.rng, MIN_CREATION_DELAY, MAX_CREATION_DELAY);
      return;
    }

    this.nextCreationAt = simTime + randomInt(
      this.rng,
      MIN_CREATION_RETRY_DELAY,
      MAX_CREATION_RETRY_DELAY,
    );
  }

  private createPullRequestAt(simTime: number): void {
    const pr = this.makePullRequest(simTime);
    this.pullRequests.set(pr.id, {
      pr,
      nextActionAt: simTime + randomInt(this.rng, MIN_REVIEW_DELAY, MAX_REVIEW_DELAY),
    });
    this.lastCreationAt = simTime;
    this.dispatch({ type: 'PR_CREATED', pr: { ...pr } });
  }

}
