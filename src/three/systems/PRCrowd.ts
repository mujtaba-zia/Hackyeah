import * as THREE from 'three';
import type { WorldContext } from '../core/context';
import { characterMaterials } from '../core/materials';
import {
  PR_ROUTE_BACK,
  PR_ROUTE_TO_MERGE,
  PR_ROUTE_TO_REVIEW,
  PR_SPAWN,
  REVIEW_WAITING_SPOTS,
  type Vec3,
} from '../world/cityPlan';
import {
  prAgeHours,
  prMood,
  type GameState,
  type PrMood,
  type PullRequest,
  type RepoId,
} from '../../game/state/gameState';

const MAX_INDIVIDUALS_PER_REPO = 5;
const WALK_SPEED = 3.4;
const MAX_FRAME_SECONDS = 0.25;
const ROUTE_EPSILON = 0.0001;
const CELEBRATION_SECONDS = 0.7;
const GROUP_PULSE_SECONDS = 0.34;

type Station = 'spawn' | 'review' | 'merge';

interface CharacterPlan {
  key: string;
  repoId: RepoId;
  prIds: string[];
  isGroup: boolean;
  station: Station;
  mood: PrMood;
}

interface CrowdMember {
  key: string;
  repoId: RepoId;
  prIds: string[];
  isGroup: boolean;
  root: THREE.Group;
  figure: THREE.Group;
  body: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshLambertMaterial>;
  head: THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>;
  badge: THREE.Mesh<THREE.CircleGeometry, THREE.MeshLambertMaterial>;
  station: Station;
  desiredStation: Station;
  destination: Station;
  route: readonly Vec3[] | null;
  waypoint: number;
  movingToSpot: boolean;
  walking: boolean;
  waitingSpot: number | null;
  ownsWaitingSpot: boolean;
  mood: PrMood;
  heading: number;
  x: number;
  y: number;
  z: number;
  phase: number;
  badgeScale: number;
  groupPulse: number;
  pickSignature: string;
  celebrationElapsed: number;
}

/** Keeps pull requests legible without rebuilding their 3D actors on each state tick. */
export class PRCrowd {
  private readonly ctx: WorldContext;
  private readonly bodyGeometry: THREE.CapsuleGeometry;
  private readonly headGeometry: THREE.SphereGeometry;
  private readonly badgeGeometry: THREE.CircleGeometry;
  private readonly members = new Map<string, CrowdMember>();
  private readonly activeMembers: CrowdMember[] = [];
  private readonly retiringMembers: CrowdMember[] = [];
  private readonly takenSpots = new Set<number>();
  private readonly stopFrame: () => void;
  private destroyed = false;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.bodyGeometry = new THREE.CapsuleGeometry(0.23, 0.54, 4, 8);
    this.headGeometry = new THREE.SphereGeometry(0.18, 10, 8);
    this.badgeGeometry = new THREE.CircleGeometry(0.18, 12);
    this.stopFrame = ctx.renderer.onFrame(this.update);
  }

  /** Reuses standing characters, then only moves or retires the members that changed. */
  sync(state: GameState): void {
    if (this.destroyed) return;

    const plans = this.plan(state);
    const seen = new Set<string>();
    const livePrIds = new Set<string>();

    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index]!;
      seen.add(plan.key);
      for (let prIndex = 0; prIndex < plan.prIds.length; prIndex += 1) {
        livePrIds.add(plan.prIds[prIndex]!);
      }

      const member = this.members.get(plan.key) ?? this.spawn(plan);
      const lostGroupedMember = member.isGroup && lostMember(member.prIds, plan.prIds);
      const membershipChanged = !sameMembers(member.prIds, plan.prIds) || member.isGroup !== plan.isGroup;
      if (membershipChanged) {
        member.prIds = plan.prIds;
        member.isGroup = plan.isGroup;
        this.refreshBadge(member);
        this.refreshPicker(member);
      }
      if (lostGroupedMember) member.groupPulse = GROUP_PULSE_SECONDS;
      if (member.mood !== plan.mood) this.setMood(member, plan.mood);

      member.desiredStation = plan.station;
      if (!member.walking && member.station !== member.desiredStation) {
        this.beginTransition(member);
      }
    }

    for (let index = this.activeMembers.length - 1; index >= 0; index -= 1) {
      const member = this.activeMembers[index]!;
      if (seen.has(member.key)) continue;

      this.members.delete(member.key);
      this.removeActiveMember(index);
      this.releaseSpot(member);
      this.ctx.picker.unregister(member.root);
      if (memberIsMerged(member, livePrIds)) {
        member.celebrationElapsed = 0;
        this.retiringMembers.push(member);
      } else {
        this.disposeMember(member);
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.stopFrame();
    for (let index = this.activeMembers.length - 1; index >= 0; index -= 1) {
      const member = this.activeMembers[index]!;
      this.ctx.picker.unregister(member.root);
      this.disposeMember(member);
    }
    for (let index = this.retiringMembers.length - 1; index >= 0; index -= 1) {
      this.disposeMember(this.retiringMembers[index]!);
    }
    this.members.clear();
    this.activeMembers.length = 0;
    this.retiringMembers.length = 0;
    this.takenSpots.clear();
    this.bodyGeometry.dispose();
    this.headGeometry.dispose();
    this.badgeGeometry.dispose();
  }

  private readonly update = (dtSeconds: number, elapsed: number): void => {
    if (this.destroyed) return;

    const frameSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, dtSeconds));
    if (!(frameSeconds > 0)) return;

    for (let index = 0; index < this.activeMembers.length; index += 1) {
      const member = this.activeMembers[index]!;
      if (member.walking) this.advanceMember(member, WALK_SPEED * frameSeconds);
      this.animateMember(member, frameSeconds, elapsed);
    }
    this.animateRetiringMembers(frameSeconds);
  };

  private plan(state: GameState): CharacterPlan[] {
    const byRepository = new Map<RepoId, PullRequest[]>();
    for (let index = 0; index < state.pullRequests.length; index += 1) {
      const pr = state.pullRequests[index]!;
      if (pr.status === 'merged') continue;

      let repository = byRepository.get(pr.repoId);
      if (!repository) {
        repository = [];
        byRepository.set(pr.repoId, repository);
      }
      repository.push(pr);
    }

    const plans: CharacterPlan[] = [];
    for (let index = 0; index < state.repositories.length; index += 1) {
      const repository = state.repositories[index]!;
      const open = byRepository.get(repository.id);
      if (!open || open.length === 0) continue;

      open.sort((left, right) => left.createdAtSim - right.createdAtSim);
      const individualCount = Math.min(MAX_INDIVIDUALS_PER_REPO, open.length);
      for (let prIndex = 0; prIndex < individualCount; prIndex += 1) {
        const pr = open[prIndex]!;
        plans.push({
          key: pr.id,
          repoId: repository.id,
          prIds: [pr.id],
          isGroup: false,
          station: stationFor(pr),
          mood: prMood(prAgeHours(pr, state.sim.time), pr.status),
        });
      }

      if (open.length > MAX_INDIVIDUALS_PER_REPO) {
        const oldestOverflow = open[MAX_INDIVIDUALS_PER_REPO]!;
        const prIds: string[] = [];
        for (let prIndex = MAX_INDIVIDUALS_PER_REPO; prIndex < open.length; prIndex += 1) {
          prIds.push(open[prIndex]!.id);
        }
        plans.push({
          key: `group:${repository.id}`,
          repoId: repository.id,
          prIds,
          isGroup: true,
          station: stationFor(oldestOverflow),
          mood: prMood(prAgeHours(oldestOverflow, state.sim.time), oldestOverflow.status),
        });
      }
    }

    return plans;
  }

  private spawn(plan: CharacterPlan): CrowdMember {
    const root = new THREE.Group();
    const figure = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeometry, characterMaterials.happy);
    const head = new THREE.Mesh(this.headGeometry, characterMaterials.skin);
    const badge = new THREE.Mesh(this.badgeGeometry, characterMaterials[plan.repoId]);
    body.position.y = 0.5;
    head.position.y = 0.98;
    badge.position.set(0.3, 1.03, 0);
    badge.visible = false;
    figure.add(body, head, badge);
    root.add(figure);
    root.position.set(PR_SPAWN.x, PR_SPAWN.y, PR_SPAWN.z);
    root.name = `pr-${plan.key}`;
    this.ctx.scene.add(root);

    const member: CrowdMember = {
      key: plan.key,
      repoId: plan.repoId,
      prIds: plan.prIds,
      isGroup: plan.isGroup,
      root,
      figure,
      body,
      head,
      badge,
      station: 'spawn',
      desiredStation: 'spawn',
      destination: 'spawn',
      route: null,
      waypoint: 0,
      movingToSpot: false,
      walking: false,
      waitingSpot: null,
      ownsWaitingSpot: false,
      mood: 'happy',
      heading: 0,
      x: PR_SPAWN.x,
      y: PR_SPAWN.y,
      z: PR_SPAWN.z,
      phase: phaseFor(plan.key),
      badgeScale: 1,
      groupPulse: 0,
      pickSignature: '',
      celebrationElapsed: 0,
    };

    this.members.set(plan.key, member);
    this.activeMembers.push(member);
    this.refreshBadge(member);
    this.refreshPicker(member);
    this.setMood(member, plan.mood);
    return member;
  }

  private setMood(member: CrowdMember, mood: PrMood): void {
    member.mood = mood;
    member.body.material = characterMaterials[mood];
  }

  private refreshBadge(member: CrowdMember): void {
    member.badge.visible = member.isGroup;
    member.badgeScale = member.isGroup ? 0.88 + Math.min(member.prIds.length, 10) * 0.06 : 1;
  }

  private refreshPicker(member: CrowdMember): void {
    const signature = `${member.isGroup ? 'group' : 'pr'}:${member.prIds.join('|')}`;
    if (signature === member.pickSignature) return;

    if (member.pickSignature.length > 0) this.ctx.picker.unregister(member.root);
    if (member.isGroup) {
      this.ctx.picker.register(member.root, {
        kind: 'pr-group',
        repoId: member.repoId,
        prIds: member.prIds,
      });
    } else {
      this.ctx.picker.register(member.root, { kind: 'pr', prId: member.prIds[0]! });
    }
    member.pickSignature = signature;
  }

  private beginTransition(member: CrowdMember): void {
    if (member.desiredStation === 'review') {
      this.claimSpot(member);
      this.startRoute(
        member,
        member.station === 'spawn' ? PR_ROUTE_TO_REVIEW : PR_ROUTE_BACK,
        'review',
      );
      return;
    }

    this.releaseSpot(member);
    if (member.desiredStation === 'merge') {
      if (member.station === 'spawn') {
        this.startRoute(member, PR_ROUTE_TO_REVIEW, 'review');
      } else {
        this.startRoute(member, PR_ROUTE_TO_MERGE, 'merge');
      }
      return;
    }

    this.startRoute(member, PR_ROUTE_BACK, 'spawn');
  }

  private startRoute(member: CrowdMember, route: readonly Vec3[], destination: Station): void {
    member.destination = destination;
    member.route = route;
    member.waypoint = 0;
    member.movingToSpot = false;
    member.walking = true;
  }

  private advanceMember(member: CrowdMember, distance: number): void {
    let remaining = distance;
    let traversed = 0;

    while (remaining > 0 && member.walking && traversed < 32) {
      const target = this.targetFor(member);
      if (!target) {
        this.reachTarget(member);
        traversed += 1;
        continue;
      }

      const dx = target.x - member.x;
      const dy = target.y - member.y;
      const dz = target.z - member.z;
      const length = Math.hypot(dx, dy, dz);
      if (length <= ROUTE_EPSILON) {
        member.x = target.x;
        member.y = target.y;
        member.z = target.z;
        this.reachTarget(member);
        traversed += 1;
        continue;
      }

      member.heading = Math.atan2(dz, dx);
      if (remaining < length) {
        const progress = remaining / length;
        member.x += dx * progress;
        member.y += dy * progress;
        member.z += dz * progress;
        remaining = 0;
        break;
      }

      member.x = target.x;
      member.y = target.y;
      member.z = target.z;
      remaining -= length;
      this.reachTarget(member);
      traversed += 1;
    }
  }

  private targetFor(member: CrowdMember): Vec3 | null {
    if (member.route) return member.route[member.waypoint] ?? null;
    if (member.movingToSpot && member.waitingSpot !== null) {
      return REVIEW_WAITING_SPOTS[member.waitingSpot] ?? null;
    }
    return null;
  }

  private reachTarget(member: CrowdMember): void {
    if (member.route) {
      member.waypoint += 1;
      if (member.waypoint < member.route.length) return;

      member.route = null;
      if (member.destination === 'review' && member.waitingSpot !== null) {
        member.movingToSpot = true;
        return;
      }
    } else if (member.movingToSpot) {
      member.movingToSpot = false;
    }

    member.walking = false;
    member.station = member.destination;
    if (member.station !== member.desiredStation) this.beginTransition(member);
  }

  private claimSpot(member: CrowdMember): void {
    if (member.waitingSpot !== null) return;

    for (let index = 0; index < REVIEW_WAITING_SPOTS.length; index += 1) {
      if (this.takenSpots.has(index)) continue;
      this.takenSpots.add(index);
      member.waitingSpot = index;
      member.ownsWaitingSpot = true;
      return;
    }

    member.waitingSpot = REVIEW_WAITING_SPOTS.length - 1;
    member.ownsWaitingSpot = false;
  }

  private releaseSpot(member: CrowdMember): void {
    if (member.waitingSpot === null) return;

    if (member.ownsWaitingSpot) this.takenSpots.delete(member.waitingSpot);
    member.waitingSpot = null;
    member.ownsWaitingSpot = false;
  }

  private animateMember(member: CrowdMember, dtSeconds: number, elapsed: number): void {
    if (member.groupPulse > 0) {
      member.groupPulse = Math.max(0, member.groupPulse - dtSeconds);
    }

    const time = elapsed + member.phase;
    let bob = 0;
    let sideways = 0;
    let pitch = 0;
    let roll = 0;

    switch (member.mood) {
      case 'happy':
        bob = Math.sin(time * 3.2) * 0.09;
        break;
      case 'calm':
        bob = Math.sin(time * 1.8) * 0.04;
        roll = 0.06;
        break;
      case 'watching':
        bob = Math.sin(time * 1.4) * 0.025;
        pitch = -0.2;
        break;
      case 'pacing':
        sideways = Math.sin(time * 2.8) * 0.32;
        bob = Math.abs(Math.sin(time * 5.6)) * 0.04;
        break;
      case 'annoyed':
        bob = Math.sin(time * 4.6) * 0.035;
        pitch = -0.1;
        roll = Math.sin(time * 8.4) * 0.08;
        break;
      case 'angry':
        sideways = Math.sin(time * 23) * 0.07;
        bob = Math.abs(Math.sin(time * 14)) * 0.05;
        pitch = -0.24;
        roll = Math.sin(time * 21) * 0.16;
        break;
    }

    const pulse = member.groupPulse > 0
      ? 1 + Math.sin((GROUP_PULSE_SECONDS - member.groupPulse) * 22) * 0.12
      : 1;
    member.root.position.set(member.x, member.y, member.z);
    member.root.rotation.y = member.heading;
    member.figure.position.set(sideways, bob, 0);
    member.figure.rotation.set(pitch, 0, roll);
    member.badge.rotation.y = -member.heading;
    member.badge.scale.setScalar(member.badgeScale * pulse);
  }

  private animateRetiringMembers(dtSeconds: number): void {
    for (let index = 0; index < this.retiringMembers.length;) {
      const member = this.retiringMembers[index]!;
      member.celebrationElapsed += dtSeconds;
      const progress = Math.min(1, member.celebrationElapsed / CELEBRATION_SECONDS);
      member.figure.position.y = Math.sin(progress * Math.PI) * 0.85;
      member.root.rotation.y += dtSeconds * 8;
      member.root.scale.setScalar(1 - progress * 0.7);

      if (progress < 1) {
        index += 1;
        continue;
      }

      this.disposeMember(member);
      const lastIndex = this.retiringMembers.length - 1;
      if (index !== lastIndex) this.retiringMembers[index] = this.retiringMembers[lastIndex]!;
      this.retiringMembers.pop();
    }
  }

  private removeActiveMember(index: number): void {
    const lastIndex = this.activeMembers.length - 1;
    if (index !== lastIndex) this.activeMembers[index] = this.activeMembers[lastIndex]!;
    this.activeMembers.pop();
  }

  private disposeMember(member: CrowdMember): void {
    this.ctx.scene.remove(member.root);
  }
}

function stationFor(pr: PullRequest): Station {
  if (pr.status === 'approved') return 'merge';
  if (pr.status === 'changes-requested' || pr.status === 'updating') return 'spawn';
  return 'review';
}


function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function lostMember(previous: readonly string[], next: readonly string[]): boolean {
  for (let index = 0; index < previous.length; index += 1) {
    if (!next.includes(previous[index]!)) return true;
  }
  return false;
}

function memberIsMerged(member: CrowdMember, livePrIds: ReadonlySet<string>): boolean {
  for (let index = 0; index < member.prIds.length; index += 1) {
    if (livePrIds.has(member.prIds[index]!)) return false;
  }
  return true;
}

function phaseFor(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return (hash % 628) / 100;
}
