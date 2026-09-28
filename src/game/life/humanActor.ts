import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { Bone, Mesh, type MeshStandardMaterial } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SURVIVOR_MODEL } from '@/data/visualAssets';
import {
  addBeanie,
  addStethoscope,
  ARMS_DOWN,
  BOOTS,
  type Dir,
  type HeadStyle,
  regrade,
  TROUSERS,
} from '@/game/rescue/humanRig';

/** Stride length (m) at walking pace; steps per second follow from speed. */
export const STRIDE = 1.35;

/** One realistic human: avatar cloned with its own clothing grade. */
export function useHumanModel(
  jacket: string,
  options: {
    beanie?: boolean;
    trousers?: string;
    head?: HeadStyle;
    stethoscope?: boolean;
  } = {},
) {
  const gltf = useGLTF(SURVIVOR_MODEL);
  return useMemo(() => {
    const scene = cloneSkinned(gltf.scene);
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      const material = node.material as MeshStandardMaterial;
      const name = material.name;
      if (name.includes('Headwear')) node.visible = false;
      else if (name.includes('Outfit_Top'))
        node.material = regrade(material, jacket, `top-${jacket}`);
      else if (name.includes('Outfit_Bottom'))
        node.material = regrade(
          material,
          options.trousers ?? TROUSERS,
          `bottom-${options.trousers ?? ''}`,
        );
      else if (name.includes('Footwear')) node.material = regrade(material, BOOTS, 'boots');
    });
    if (options.head) addBeanie(scene, options.head);
    else if (options.beanie !== false) addBeanie(scene);
    if (options.stethoscope) addStethoscope(scene);
    const bones = new Map<string, Bone>();
    scene.traverse((node) => {
      if ((node as Bone).isBone) bones.set(node.name, node as Bone);
    });
    const rest = new Map([...bones].map(([name, bone]) => [name, bone.quaternion.clone()]));
    return { scene, bones, rest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene, jacket, options.beanie, options.trousers, options.stethoscope]);
}

/**
 * Walk / run cycle from the gait phase: thighs swing fore and aft, knees flex on the swing leg,
 * arms counter-swing, and the body bobs twice per stride. `amount` 0 = standing, 1 = full gait.
 */
export function gaitAims(phase: number, amount: number, run: boolean): Record<string, Dir> {
  const swing = (run ? 0.75 : 0.42) * amount;
  const s = Math.sin(phase);
  const lift = (v: number) => Math.max(0, v) * (run ? 0.9 : 0.55) * amount;
  const arm = (run ? 0.55 : 0.3) * amount;
  return {
    LeftUpLeg: [0.08, -1, s * swing + lift(Math.cos(phase)) * 0.4],
    LeftLeg: [0.03, -1, s * swing * 0.4 - lift(Math.cos(phase))],
    RightUpLeg: [-0.08, -1, -s * swing + lift(-Math.cos(phase)) * 0.4],
    RightLeg: [-0.03, -1, -s * swing * 0.4 - lift(-Math.cos(phase))],
    LeftArm: [ARMS_DOWN.LeftArm[0], -1, -s * arm],
    LeftForeArm: [0.08, -1, 0.25 - s * arm * 0.6 + (run ? 0.9 : 0)],
    RightArm: [ARMS_DOWN.RightArm[0], -1, s * arm],
    RightForeArm: [-0.08, -1, 0.25 + s * arm * 0.6 + (run ? 0.9 : 0)],
    Spine: [0, 1, run ? 0.22 : 0.06 * amount],
  };
}
