import { useEffect, useRef } from 'react';
import { CityWorld } from '../../three/CityWorld';
import type { HoverPayload } from '../../game/state/hover';
import type { BuildingId } from '../../domain/ids';
import './CityCanvas.css';

interface Props {
  onSelectionChange: (id: BuildingId | null) => void;
  onHover: (payload: HoverPayload | null) => void;
  /** Receives the live world so the UI can drive camera commands. */
  onWorldReady: (world: CityWorld | null) => void;
}

export function CityCanvas({ onSelectionChange, onHover, onWorldReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks without rebuilding the world.
  const selectionRef = useRef(onSelectionChange);
  const hoverRef = useRef(onHover);
  selectionRef.current = onSelectionChange;
  hoverRef.current = onHover;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const world = new CityWorld(parent, {
      onSelectionChange: (id) => selectionRef.current(id),
      onHover: (payload) => hoverRef.current(payload),
    });
    onWorldReady(world);

    return () => {
      onWorldReady(null);
      world.destroy();
    };
  }, [onWorldReady]);

  return <div className="city-canvas" ref={containerRef} />;
}
