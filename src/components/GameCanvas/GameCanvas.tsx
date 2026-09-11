import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../../game/config/gameConfig';
import { CityScene } from '../../game/scenes/CityScene';
import type { HoverPayload } from '../../game/state/hover';
import type { BuildingId } from '../../game/world/cityLayout';
import './GameCanvas.css';

interface Props {
  onSelectionChange: (id: BuildingId | null) => void;
  onHover: (payload: HoverPayload | null) => void;
  /** Receives the live scene so the debug panel can drive camera commands. */
  onSceneReady: (scene: CityScene | null) => void;
}

export function GameCanvas({ onSelectionChange, onHover, onSceneReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks without re-creating the Phaser game.
  const selectionRef = useRef(onSelectionChange);
  const hoverRef = useRef(onHover);
  selectionRef.current = onSelectionChange;
  hoverRef.current = onHover;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const game = new Phaser.Game(createGameConfig(parent));
    game.scene.add(CityScene.KEY, CityScene, true, {
      onSelectionChange: (id: BuildingId | null) => selectionRef.current(id),
      onHover: (payload: HoverPayload | null) => hoverRef.current(payload),
      onReady: (scene: CityScene) => onSceneReady(scene),
    });

    return () => {
      onSceneReady(null);
      game.destroy(true);
    };
  }, [onSceneReady]);

  return <div className="game-canvas" ref={containerRef} />;
}
