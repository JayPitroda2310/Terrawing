import {
  type Camera,
  HalfFloatType,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/** Camera layer masks saved while the scene is hidden. */
const saved = new WeakMap<Camera, number>();

/**
 * Stops the scene being drawn (the loading screen covers it anyway). Nothing new gets drawn, so
 * nothing forces a shader to compile on the main thread while the loader is up.
 */
export function hideScene(camera: Camera): void {
  if (saved.has(camera)) return;
  saved.set(camera, camera.layers.mask);
  camera.layers.disableAll();
}

export function showScene(camera: Camera): void {
  const mask = saved.get(camera);
  if (mask === undefined) return;
  camera.layers.mask = mask;
  saved.delete(camera);
}

interface ProgramLike {
  isReady(): boolean;
  /** The GL program; three clears it when the program is released (replaced or disposed). */
  program?: unknown;
}

/** Never hold a loading screen longer than this on shader compilation. */
const COMPILE_TIMEOUT_MS = 25_000;

/**
 * Compiles every material in the scene — on screen or not, for direct and post-processed
 * (off-screen) rendering — through the browser's parallel shader compiler, and uploads every
 * texture. `onProgress` gets the real fraction of shader programs the browser reports finished;
 * resolves once all are ready, without blocking the page meanwhile.
 */
export async function compileScene(
  gl: WebGLRenderer,
  scene: Object3D,
  camera: Camera,
  onProgress?: (fraction: number) => void,
  offscreen = false,
): Promise<void> {
  // Compile as the real view will render (its layers decide which lights count).
  const view = camera.clone();
  const mask = saved.get(camera);
  if (mask !== undefined) view.layers.mask = mask;
  // Only the variant the game will draw with: straight to the screen, or into the
  // post-processing target (linear output, no tone mapping) when bloom is on.
  const target = offscreen ? new WebGLRenderTarget(1, 1, { type: HalfFloatType }) : null;
  const previous = gl.getRenderTarget();
  if (target) gl.setRenderTarget(target);
  const materials = new Set<Material>(gl.compile(scene, view));
  if (target) gl.setRenderTarget(previous);

  const textures = new Set<Texture>();
  scene.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material])
      for (const value of Object.values(m))
        if ((value as Texture | null)?.isTexture) textures.add(value as Texture);
  });
  for (const texture of textures) gl.initTexture(texture);

  // Every program the materials now have (both variants), polled without blocking.
  const programs = new Set<ProgramLike>();
  for (const material of materials) {
    const state = gl.properties.get(material) as { programs?: Map<string, ProgramLike> };
    state.programs?.forEach((program) => programs.add(program));
  }
  const total = Math.max(1, programs.size);
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const poll = () => {
      for (const program of programs)
        if (program.program === undefined || program.isReady()) programs.delete(program);
      onProgress?.(1 - programs.size / total);
      if (programs.size === 0 || performance.now() - started > COMPILE_TIMEOUT_MS) resolve();
      else setTimeout(poll, 50);
    };
    poll();
  });
  target?.dispose();
}

/** Loading counts as finished only after this long with no new file or scene object. */
const QUIET_MS = 500;

/** Where a loading screen is in getting its scene ready. */
export interface WarmupGate {
  phase: 'loading' | 'compiling' | 'ready';
  /** Last time anything was still loading. */
  lastBusy: number;
  /** Frames drawn since the shaders became ready. */
  frames: number;
  /** Bumped to abandon a compile that a late wave of files made stale. */
  generation: number;
  /** Objects in the scene last frame (things that mount late count as still loading). */
  objects: number;
}

export function createWarmupGate(): WarmupGate {
  return { phase: 'loading', lastBusy: 0, frames: 0, generation: 0, objects: -1 };
}

/**
 * One frame of a loading screen's scene preparation. The scene stays undrawn while files load;
 * once nothing new has started for a moment, every shader compiles in the background (progress
 * reported as the build stage, 0..0.9); then the scene is drawn for `settleFrames` warm-up frames
 * (0.9..1). A late wave of files sends it back to loading. Returns true when ready to hand over.
 */
export function stepWarmupGate(
  gate: WarmupGate,
  gl: WebGLRenderer,
  scene: Object3D,
  camera: Camera,
  busy: boolean,
  settleFrames: number,
  report: (build: number) => void,
  offscreen = false,
): boolean {
  const now = performance.now();
  // Still loading while files download or anything is still being added to the scene (models
  // that were already downloaded mount without any loader activity).
  let objects = 0;
  scene.traverse(() => objects++);
  if (objects !== gate.objects) {
    gate.objects = objects;
    busy = true;
  }
  if (busy) gate.lastBusy = now;
  if (busy || now - gate.lastBusy < QUIET_MS) {
    hideScene(camera);
    if (gate.phase !== 'loading') {
      gate.phase = 'loading';
      gate.generation++;
    }
    gate.frames = 0;
    return false;
  }
  if (gate.phase === 'loading') {
    gate.phase = 'compiling';
    const generation = ++gate.generation;
    void compileScene(
      gl,
      scene,
      camera,
      (f) => {
        if (generation === gate.generation) report(0.9 * f);
      },
      offscreen,
    ).finally(() => {
      if (generation === gate.generation) gate.phase = 'ready';
    });
  }
  if (gate.phase !== 'ready') {
    hideScene(camera);
    return false;
  }
  showScene(camera);
  gate.frames++;
  report(0.9 + 0.1 * Math.min(1, gate.frames / settleFrames));
  return gate.frames >= settleFrames;
}
