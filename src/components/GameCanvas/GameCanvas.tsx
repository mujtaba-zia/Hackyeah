import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../../game/config/gameConfig';
import { CityScene } from '../../game/scenes/CityScene';
import type { BuildingId } from '../../game/world/cityLayout';
import './GameCanvas.css';

interface Props {
  onSelectionChange: (id: BuildingId | null) => void;
  /** Receives the live scene so the HUD can drive camera commands. */
  onSceneReady: (scene: CityScene | null) => void;
}

export function GameCanvas({ onSelectionChange, onSceneReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-creating the Phaser game.
  const selectionRef = useRef(onSelectionChange);
  selectionRef.current = onSelectionChange;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const game = new Phaser.Game(createGameConfig(parent));
    game.scene.add(CityScene.KEY, CityScene, true, {
      onSelectionChange: (id: BuildingId | null) => selectionRef.current(id),
      onReady: (scene: CityScene) => onSceneReady(scene),
    });
    return () => {
      onSceneReady(null);
      game.destroy(true);
    };
  }, [onSceneReady]);

  return <div className="game-canvas" ref={containerRef} />;
}
