import Phaser from 'phaser';
import type { PipelineArtifact } from '../entities/PipelineArtifact';
import type { PipelineTruck } from '../entities/PipelineTruck';
import type { StageBuilding } from '../entities/StageBuilding';
import { gameStore } from '../state/gameStore';
import { STAGES, STAGE_BUILDING, type PipelineStage } from '../state/gameState';
import {
  BUILDING_DOOR,
  CITY_CENTER,
  EMERGENCY_ROUTE,
  PIPELINE_LEGS,
  type BuildingId,
} from '../world/cityLayout';
import { tileToWorld } from '../world/iso';
import type { CameraController } from './CameraController';
import type { PedestrianSystem } from './PedestrianSystem';
import type { TrafficSystem } from './TrafficSystem';

/** How long a stage "works" before it reports a result. */
const STAGE_WORK_MS = 1500;
/** Pipeline truck speed in world pixels per second. Tuned so a full demo run
 *  lands inside the 15 to 25 second presentation window. */
const TRUCK_SPEED = 330;
const EMERGENCY_SPEED = 380;

export interface ChoreographerDeps {
  buildings: Map<BuildingId, StageBuilding>;
  truck: PipelineTruck;
  emergency: PipelineTruck;
  artifact: PipelineArtifact;
  traffic: TrafficSystem;
  pedestrians: PedestrianSystem;
  camera: CameraController;
}

/**
 * Turns pipeline events into a physical journey through the city and reports
 * progress back as further events.
 *
 *   PIPELINE_STARTED -> stage runs -> stage result -> truck drives -> next stage
 *
 * It is the only place that dispatches PIPELINE_STAGE_STARTED,
 * PIPELINE_STAGE_SUCCEEDED and PIPELINE_COMPLETED, so React and a future Azure
 * DevOps adapter only ever have to say "start" or "fail".
 *
 * Stage statuses are painted by the scene's state subscription. This class owns
 * motion, timing and one-shot spectacle only.
 */
export class PipelineChoreographer {
  private readonly scene: Phaser.Scene;
  private readonly deps: ChoreographerDeps;
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private unsubscribe?: () => void;

  constructor(scene: Phaser.Scene, deps: ChoreographerDeps) {
    this.scene = scene;
    this.deps = deps;
  }

  attach(): void {
    this.unsubscribe = gameStore.bus.onAny((event) => {
      switch (event.type) {
        case 'PIPELINE_STARTED':
          this.onStarted();
          break;
        case 'PIPELINE_STAGE_STARTED':
          this.onStageStarted(event.stage);
          break;
        case 'PIPELINE_STAGE_SUCCEEDED':
          this.onStageSucceeded(event.stage);
          break;
        case 'PIPELINE_STAGE_FAILED':
          this.onStageFailed(event.stage);
          break;
        case 'PIPELINE_COMPLETED':
          // Pull back so the presenter ends on the whole living city.
          if (gameStore.getState().followCamera) {
            const view = tileToWorld(CITY_CENTER);
            this.later(700, () => this.deps.camera.focusOn(view.x, view.y, 0.62));
          }
          break;
        case 'PIPELINE_RESET':
          this.onReset();
          break;
        default:
          break;
      }
    });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.cancelPending();
  }

  private buildingFor(stage: PipelineStage): StageBuilding {
    const building = this.deps.buildings.get(STAGE_BUILDING[stage]);
    if (!building) throw new Error(`No building placed for stage ${stage}`);
    return building;
  }

  private cancelPending() {
    for (const timer of this.timers) timer.remove(false);
    this.timers.length = 0;
    this.deps.truck.stop();
    this.deps.emergency.stop();
  }

  private later(ms: number, run: () => void) {
    this.timers.push(this.scene.time.delayedCall(ms, run));
  }

  private onStarted() {
    this.cancelPending();
    this.deps.artifact.hide();
    this.deps.emergency.hide();
    this.deps.traffic.setActivity(1);
    this.deps.pedestrians.setActivity(1);

    this.deps.truck.park(BUILDING_DOOR[STAGE_BUILDING.build]);
    this.later(250, () => gameStore.dispatch({ type: 'PIPELINE_STAGE_STARTED', stage: 'build' }));
  }

  private onStageStarted(stage: PipelineStage) {
    const building = this.buildingFor(stage);
    if (gameStore.getState().followCamera) this.deps.camera.focusOn(building.x, building.y);

    if (stage === 'build') {
      this.later(900, () => this.deps.artifact.appearAt(building.x, building.y));
    }

    this.later(STAGE_WORK_MS, () => {
      const armed = gameStore.getState().pipeline.failAt;
      gameStore.dispatch(
        armed === stage
          ? { type: 'PIPELINE_STAGE_FAILED', stage }
          : { type: 'PIPELINE_STAGE_SUCCEEDED', stage },
      );
    });
  }

  private onStageSucceeded(stage: PipelineStage) {
    const index = STAGES.indexOf(stage);
    const next = STAGES[index + 1];

    if (!next) {
      this.buildingFor(stage).burstConfetti();
      this.deps.artifact.hide();
      this.deps.truck.hide();
      this.later(400, () => gameStore.dispatch({ type: 'PIPELINE_COMPLETED' }));
      return;
    }

    // Hand the crate to the truck and drive the road leg to the next landmark.
    this.later(420, () => {
      const leg = PIPELINE_LEGS[index];
      const start = tileToWorld(leg[0]);
      this.deps.artifact.sprite.setPosition(start.x, start.y - 22);
      this.deps.truck.park(leg[0]);
      this.deps.truck.load(this.deps.artifact.sprite);
      if (gameStore.getState().followCamera) this.deps.camera.follow(this.deps.truck.sprite);

      this.deps.truck.drive(leg, TRUCK_SPEED, () => {
        this.deps.camera.stopFollow();
        this.deps.truck.unload();
        const target = this.buildingFor(next);
        this.deps.artifact.deliverTo(target.x, target.y, () => {
          gameStore.dispatch({ type: 'PIPELINE_STAGE_STARTED', stage: next });
        });
      });
    });
  }

  private onStageFailed(stage: PipelineStage) {
    this.cancelPending();
    this.deps.artifact.hide();
    this.deps.camera.stopFollow();

    // The district reacts: quieter streets for a while, and a fire truck rolls
    // out when the factory itself breaks.
    this.deps.traffic.setActivity(0.45);
    this.deps.pedestrians.setActivity(0.35);
    this.later(9000, () => {
      this.deps.traffic.setActivity(1);
      this.deps.pedestrians.setActivity(1);
    });

    if (stage === 'build' && EMERGENCY_ROUTE.length > 1) {
      this.deps.emergency.park(EMERGENCY_ROUTE[0]);
      this.deps.emergency.drive(EMERGENCY_ROUTE, EMERGENCY_SPEED, () => {
        this.later(4000, () => this.deps.emergency.hide());
      });
    }
  }

  private onReset() {
    this.cancelPending();
    this.deps.artifact.hide();
    this.deps.truck.hide();
    this.deps.emergency.hide();
    this.deps.traffic.setActivity(1);
    this.deps.pedestrians.setActivity(1);
    this.deps.camera.stopFollow();
  }
}
