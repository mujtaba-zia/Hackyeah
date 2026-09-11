import Phaser from 'phaser';
import { PipelineTruck } from '../entities/PipelineTruck';
import { gameStore } from '../state/gameStore';
import { STAGES } from '../state/gameState';
import { PIPELINE_LEGS } from '../world/cityLayout';

/** Concurrent artifact deliveries. Beyond this the move is simply not shown. */
const FLEET_SIZE = 4;
const TRUCK_SPEED = 300;

interface Rig {
  truck: PipelineTruck;
  crate: Phaser.GameObjects.Image;
  busy: boolean;
}

/**
 * Drives artifacts between pipeline stage sites for whichever runs are moving.
 *
 * Milestone 2 had exactly one run and one truck. The simulator now advances
 * several runs at once, so a small pool is leased per stage change and returned
 * on arrival. A missed delivery is invisible rather than incorrect: the state,
 * the tooltips and the buildings still show the truth.
 */
export class DeliveryFleet {
  private readonly rigs: Rig[] = [];
  private unsubscribe?: () => void;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < FLEET_SIZE; i++) {
      const truck = new PipelineTruck(scene);
      const crate = scene.add.image(0, 0, 'fx-crate').setVisible(false);
      this.rigs.push({ truck, crate, busy: false });
    }
  }

  attach(): void {
    this.unsubscribe = gameStore.bus.on('RUN_STAGE_ADVANCED', (event) => {
      const toIndex = STAGES.indexOf(event.stage);
      if (toIndex <= 0) return;
      this.dispatchLeg(toIndex - 1);
    });
  }

  /** Sends a free rig along the road leg that ends at the new stage. */
  private dispatchLeg(legIndex: number) {
    const leg = PIPELINE_LEGS[legIndex];
    if (!leg) return;
    const rig = this.rigs.find((candidate) => !candidate.busy);
    if (!rig) return;

    rig.busy = true;
    rig.truck.park(leg[0]);
    rig.crate.setVisible(true);
    rig.truck.load(rig.crate);
    rig.truck.drive(leg, TRUCK_SPEED, () => {
      rig.truck.unload();
      rig.crate.setVisible(false);
      rig.truck.hide();
      rig.busy = false;
    });
  }

  /** Returns every rig to the depot, used on simulation reset. */
  reset(): void {
    for (const rig of this.rigs) {
      rig.truck.hide();
      rig.crate.setVisible(false);
      rig.busy = false;
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const rig of this.rigs) {
      rig.truck.hide();
      rig.crate.destroy();
    }
  }
}
