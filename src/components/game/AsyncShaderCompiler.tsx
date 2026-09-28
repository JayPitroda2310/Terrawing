import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { HalfFloatType, type Material, type Object3D, WebGLRenderTarget } from 'three';

type Drawable = Object3D & { material?: Material | Material[] };

const isDrawable = (object: Object3D): object is Drawable =>
  (object as { isMesh?: boolean }).isMesh === true ||
  (object as { isPoints?: boolean }).isPoints === true ||
  (object as { isLine?: boolean }).isLine === true ||
  (object as { isSprite?: boolean }).isSprite === true;

/**
 * Keeps shader compilation off the critical path. Every frame, before rendering, it finds objects
 * whose shader would have to be built on this draw — new materials, and materials whose version
 * changed (e.g. a texture arrived and was assigned) — hides them, and compiles their shaders with
 * `compileAsync`, which with KHR_parallel_shader_compile lets the driver work in the background
 * without blocking. Each object reappears once its shader is ready (usually within a frame or
 * two). Without this, the first draw of every new shader variant stalls the main thread until
 * the browser finishes compiling it — tens of seconds for a full world.
 */
export function AsyncShaderCompiler({ offscreen }: { offscreen: boolean }) {
  /**
   * With post-processing the scene is drawn into an off-screen target, which selects different
   * shader variants (no tone mapping, linear output) — compile against one so they match.
   */
  const target = useMemo(
    () => (offscreen ? new WebGLRenderTarget(1, 1, { type: HalfFloatType }) : null),
    [offscreen],
  );
  useEffect(() => () => target?.dispose(), [target]);
  /** Objects waiting for their shaders, with whether they were visible when we hid them. */
  const pending = useMemo(() => new Map<Object3D, boolean>(), []);
  /** Material version we last compiled (so a version change triggers exactly one recompile). */
  const compiled = useMemo(() => new WeakMap<Material, number>(), []);

  useFrame(({ gl, scene, camera }) => {
    const properties = gl.properties;
    const needsCompile = (material: Material) => {
      const state = properties.get(material) as { currentProgram?: unknown; __version?: number };
      if (state.currentProgram === undefined) return !compiled.has(material);
      return state.__version !== material.version && compiled.get(material) !== material.version;
    };
    const fresh: Object3D[] = [];
    scene.traverse((object) => {
      if (!isDrawable(object) || pending.has(object) || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((m) => m && needsCompile(m))) fresh.push(object);
    });
    if (fresh.length === 0) return;
    for (const object of fresh as Drawable[]) {
      pending.set(object, object.visible);
      object.visible = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material) compiled.set(material, material.version);
    }
    const previous = gl.getRenderTarget();
    if (target) gl.setRenderTarget(target);
    for (const object of fresh) {
      gl.compileAsync(object, camera, scene)
        .catch(() => undefined)
        .finally(() => {
          // Restore visibility only if we hid it and nobody changed it since.
          if (pending.get(object) && !object.visible) object.visible = true;
          pending.delete(object);
        });
    }
    gl.setRenderTarget(previous);
  });

  return null;
}
