import * as THREE from 'three';

type FrameCallback = (dtSeconds: number, elapsed: number) => void;

const SKY_COLOUR = 0x9bdcff;
const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_DELTA_SECONDS = 0.1;

/** Owns the WebGL lifetime so world systems only need a scene and frame clock. */
export class ThreeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly hemisphereLight: THREE.HemisphereLight;
  readonly keyLight: THREE.DirectionalLight;

  private readonly canvasParent: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly observeResize = (): void => {
    this.resize();
  };
  private readonly frameCallbacks = new Map<number, FrameCallback>();
  private readonly invokeFrame = (callback: FrameCallback): void => {
    callback(this.frameDelta, this.frameElapsed);
  };
  private readonly renderFrame = (time: number): void => {
    if (!this.running || this.destroyed) return;

    if (!this.hasFrameTime) {
      this.hasFrameTime = true;
      this.firstFrameTime = time;
      this.lastFrameTime = time;
      this.frameDelta = 0;
      this.frameElapsed = 0;
    } else {
      this.frameDelta = Math.min(
        MAX_FRAME_DELTA_SECONDS,
        Math.max(0, (time - this.lastFrameTime) / 1000),
      );
      this.frameElapsed = Math.max(0, (time - this.firstFrameTime) / 1000);
      this.lastFrameTime = time;
    }

    this.frameCallbacks.forEach(this.invokeFrame);
    if (!this.destroyed) this.renderer.render(this.scene, this.camera);
  };

  private running = false;
  private destroyed = false;
  private hasFrameTime = false;
  private firstFrameTime = 0;
  private lastFrameTime = 0;
  private frameDelta = 0;
  private frameElapsed = 0;
  private nextFrameCallbackId = 1;

  constructor(canvasParent: HTMLElement) {
    this.canvasParent = canvasParent;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvasParent.appendChild(this.canvas);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOUR);
    // Far enough back that it only softens the horizon: both cities span roughly
    // 200 metres, and an aggressive fog turned the skyline into haze.
    // Starts past the far city so both stay crisp, then blends the open ground
    // into the sky so the horizon reads as haze instead of a cut edge.
    this.scene.fog = new THREE.Fog(SKY_COLOUR, 430, 1150);

    // The far plane must clear the maximum orbit distance plus the world behind
    // it, otherwise zooming out clips the city away and leaves bare sky.
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 3600);
    this.camera.position.set(48, 58, 72);

    this.hemisphereLight = new THREE.HemisphereLight(0xdff5ff, 0x6c9458, 2.1);
    this.keyLight = new THREE.DirectionalLight(0xfff3d6, 2.8);
    this.keyLight.position.set(-52, 78, 42);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -150;
    this.keyLight.shadow.camera.right = 150;
    this.keyLight.shadow.camera.top = 105;
    this.keyLight.shadow.camera.bottom = -105;
    this.keyLight.shadow.camera.near = 8;
    this.keyLight.shadow.camera.far = 220;
    this.keyLight.shadow.bias = -0.00015;
    this.keyLight.shadow.normalBias = 0.018;
    this.keyLight.target.position.set(40, 0, 0);
    this.scene.add(this.hemisphereLight, this.keyLight, this.keyLight.target);

    this.resize();
    this.resizeObserver = new ResizeObserver(this.observeResize);
    this.resizeObserver.observe(this.canvasParent);
  }

  /** Register a per frame callback. Returns an unsubscribe. */
  onFrame(fn: FrameCallback): () => void {
    if (this.destroyed) return () => undefined;
    const id = this.nextFrameCallbackId;
    this.nextFrameCallbackId += 1;
    this.frameCallbacks.set(id, fn);
    return () => {
      this.frameCallbacks.delete(id);
    };
  }

  start(): void {
    if (this.destroyed || this.running) return;
    this.running = true;
    this.hasFrameTime = false;
    this.renderer.setAnimationLoop(this.renderFrame);
  }

  resize(): void {
    if (this.destroyed) return;
    const width = Math.max(1, this.canvasParent.clientWidth);
    const height = Math.max(1, this.canvasParent.clientHeight);
    const pixelRatio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.frameCallbacks.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
