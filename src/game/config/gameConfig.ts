import Phaser from 'phaser';

/**
 * Boot config only. The City scene is added explicitly by `GameCanvas` so it
 * can be started with React callbacks as scene data.
 */
export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#8ecae6',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    render: { antialias: true },
    scene: [],
  };
}
