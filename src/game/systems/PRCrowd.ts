import Phaser from 'phaser';
import { PRCharacter } from '../entities/PRCharacter';
import {
  prAgeHours,
  prMood,
  REPOSITORIES,
  type GameState,
  type PrMood,
  type PullRequest,
  type RepoId,
} from '../state/gameState';
import type { HoverPayload } from '../state/hover';
import {
  PR_ROUTE_BACK,
  PR_ROUTE_TO_MERGE,
  PR_ROUTE_TO_REVIEW,
  PR_SPAWN,
  REVIEW_WAITING_SPOTS,
} from '../world/cityLayout';

/** Individual characters kept per repository before older PRs are grouped. */
const MAX_INDIVIDUALS_PER_REPO = 5;

type Station = 'spawn' | 'review' | 'merge';

/** One character the crowd should currently be showing. */
interface CharacterPlan {
  key: string;
  repoId: RepoId;
  prIds: string[];
  station: Station;
  mood: PrMood;
}

interface Member {
  character: PRCharacter;
  /** PRs this character stands for: one id, or several for a group. */
  prIds: string[];
  repoId: RepoId;
  station: Station;
  spot: number | null;
}

/**
 * Renders the pull request population.
 *
 * The crowd is derived from state on every change: one character per PR while a
 * repository is quiet, and a single badged character for the overflow once a
 * repository has more than five open PRs, so Review Hall stays readable.
 */
export class PRCrowd {
  private readonly scene: Phaser.Scene;
  private readonly onHover: (payload: HoverPayload | null) => void;
  private readonly members = new Map<string, Member>();
  private readonly takenSpots = new Set<number>();
  private readonly repoColor: Record<string, number> = {};

  constructor(scene: Phaser.Scene, onHover: (payload: HoverPayload | null) => void) {
    this.scene = scene;
    this.onHover = onHover;
    for (const repo of REPOSITORIES) this.repoColor[repo.id] = repo.color;
  }

  /** Rebuilds the desired crowd from state and moves characters accordingly. */
  sync(state: GameState): void {
    const desired = this.plan(state);
    const seen = new Set<string>();

    for (const entry of desired) {
      seen.add(entry.key);
      const existing = this.members.get(entry.key);
      const member = existing ?? this.spawn(entry.key, entry.repoId);
      member.prIds = entry.prIds;
      member.character.setCount(entry.prIds.length);
      member.character.setMood(entry.mood);
      this.station(member, entry.station);
    }

    // Anything no longer in state has merged or been grouped away.
    for (const [key, member] of [...this.members]) {
      if (seen.has(key)) continue;
      this.members.delete(key);
      this.release(member);
      if (key.startsWith('group:')) {
        member.character.destroy();
      } else {
        member.character.celebrate(() => member.character.destroy());
      }
    }
  }

  /** Decides which characters should exist, where they stand and how they feel. */
  private plan(state: GameState): CharacterPlan[] {
    const plans: CharacterPlan[] = [];

    for (const repo of state.repositories) {
      const open = state.pullRequests
        .filter((pr) => pr.repoId === repo.id)
        .sort((a, b) => a.createdAtSim - b.createdAtSim);
      if (open.length === 0) continue;

      const individuals = open.slice(0, MAX_INDIVIDUALS_PER_REPO);
      const grouped = open.slice(MAX_INDIVIDUALS_PER_REPO);

      for (const pr of individuals) {
        plans.push({
          key: pr.id,
          repoId: repo.id,
          prIds: [pr.id],
          station: stationFor(pr),
          mood: prMood(prAgeHours(pr, state.sim.time), pr.status),
        });
      }

      if (grouped.length > 0) {
        // The group takes the oldest member's mood so a stale backlog still looks angry.
        const oldest = grouped[0];
        plans.push({
          key: `group:${repo.id}`,
          repoId: repo.id,
          prIds: grouped.map((pr) => pr.id),
          station: stationFor(oldest),
          mood: prMood(prAgeHours(oldest, state.sim.time), oldest.status),
        });
      }
    }

    return plans;
  }

  private spawn(key: string, repoId: RepoId): Member {
    const character = new PRCharacter(this.scene, key, PR_SPAWN, this.repoColor[repoId] ?? 0xffffff);
    const member: Member = { character, prIds: [], repoId, station: 'spawn', spot: null };
    this.members.set(key, member);

    character.sprite.setInteractive({ useHandCursor: true });
    character.sprite.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      this.onHover(
        member.prIds.length > 1
          ? { kind: 'pr-group', repoId: member.repoId, prIds: member.prIds, x: pointer.x, y: pointer.y }
          : { kind: 'pr', prId: member.prIds[0], x: pointer.x, y: pointer.y },
      );
    });
    character.sprite.on('pointerout', () => this.onHover(null));

    return member;
  }

  /** Walks a character to the station its PR status implies. */
  private station(member: Member, station: Station) {
    if (member.station === station || member.character.walking) return;
    const from = member.station;
    member.station = station;

    if (station === 'review') {
      const spot = this.claim(member);
      const route = from === 'spawn' ? PR_ROUTE_TO_REVIEW : PR_ROUTE_BACK;
      member.character.walk(route, () => member.character.moveTo(REVIEW_WAITING_SPOTS[spot]));
      return;
    }

    this.release(member);
    if (station === 'merge') {
      member.character.walk(PR_ROUTE_TO_MERGE);
      return;
    }
    member.character.walk(PR_ROUTE_BACK);
  }

  private claim(member: Member): number {
    if (member.spot !== null) return member.spot;
    for (let i = 0; i < REVIEW_WAITING_SPOTS.length; i++) {
      if (this.takenSpots.has(i)) continue;
      this.takenSpots.add(i);
      member.spot = i;
      return i;
    }
    // More characters than spots: share the last one rather than paying for
    // collision avoidance. Grouping keeps this rare.
    member.spot = REVIEW_WAITING_SPOTS.length - 1;
    return member.spot;
  }

  private release(member: Member) {
    if (member.spot === null) return;
    this.takenSpots.delete(member.spot);
    member.spot = null;
  }

  destroy(): void {
    for (const member of this.members.values()) member.character.destroy();
    this.members.clear();
    this.takenSpots.clear();
  }
}

function stationFor(pr: PullRequest): Station {
  if (pr.status === 'approved') return 'merge';
  if (pr.status === 'changes-requested' || pr.status === 'updating') return 'spawn';
  return 'review';
}
