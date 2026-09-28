import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Bone, Mesh, MeshStandardMaterial, type Group } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SURVIVOR_MODEL } from '@/data/visualAssets';
import { addBeanie, aimBone, ARMS_DOWN, BOOTS, type Dir, regrade, TROUSERS } from './humanRig';

export type SurvivorPose = 'waving' | 'sitting' | 'lying';

/** Mission poses plus 'stretcher': laid out straight on a casualty stretcher. */
export type ModelPose = SurvivorPose | 'stretcher';

interface SurvivorModelProps {
  pose: ModelPose;
  jacket: string;
  /** Read every frame: once rescued the survivor calms down (stops waving). */
  isCalm: () => boolean;
  /** Receives the posed skeleton's bones by name (e.g. for cloth collisions). */
  onBones?: (bones: ReadonlyMap<string, Bone>) => void;
}

/**
 * Limb aims in model space (model faces +Z, left side is +X for this rig). Each entry aims the
 * bone so the direction towards its child bone matches the target.
 */
interface PoseSpec {
  /** Root offset in metres (sitting/lying lower the body). */
  offset: Dir;
  /** Root rotation (lying on the back). */
  rotationX: number;
  aims: Record<string, Dir>;
}

const POSES: Record<ModelPose, PoseSpec> = {
  waving: {
    offset: [0, 0, 0],
    rotationX: 0,
    aims: {
      ...ARMS_DOWN,
      RightArm: [-0.6, 0.8, 0.15],
      RightForeArm: [-0.15, 1, 0.25],
    },
  },
  sitting: {
    offset: [0, -0.46, 0],
    rotationX: 0,
    aims: {
      LeftUpLeg: [0.12, -0.05, 1],
      LeftLeg: [0.05, -1, 0.15],
      RightUpLeg: [-0.12, -0.05, 1],
      RightLeg: [-0.05, -1, 0.15],
      Spine: [0, 1, -0.12],
      LeftArm: [0.15, -0.7, 0.55],
      LeftForeArm: [-0.2, -0.3, 1],
      RightArm: [-0.15, -0.7, 0.55],
      RightForeArm: [0.2, -0.3, 1],
      Neck: [0, 1, 0.25],
    },
  },
  stretcher: {
    offset: [0, 0.15, 0.88],
    rotationX: -Math.PI / 2,
    aims: {
      LeftArm: [0.3, -1, -0.12],
      LeftForeArm: [0.12, -1, 0.1],
      RightArm: [-0.3, -1, -0.12],
      RightForeArm: [-0.12, -1, 0.1],
      LeftUpLeg: [0.06, -1, 0],
      LeftLeg: [0.02, -1, 0.02],
      RightUpLeg: [-0.06, -1, 0],
      RightLeg: [-0.02, -1, 0.02],
      Neck: [0, 1, 0.12],
    },
  },
  lying: {
    offset: [0, 0.2, 0.9],
    rotationX: -Math.PI / 2,
    aims: {
      LeftArm: [0.55, -0.8, 0],
      LeftForeArm: [0.4, -0.9, 0.2],
      RightArm: [-0.45, -0.9, 0.1],
      RightForeArm: [-0.2, -0.7, 0.7],
      // Injured leg drawn up.
      LeftUpLeg: [0.1, -0.6, 0.8],
      LeftLeg: [0.05, -1, -0.3],
      RightUpLeg: [-0.08, -1, 0],
      RightLeg: [-0.05, -1, 0.05],
      Neck: [0, 1, 0.35],
    },
  },
};

/**
 * Realistic rigged survivor (photo-textured avatar) posed procedurally for the mission:
 * waving for help, sitting in shelter, or lying injured. Clothing is graded to outdoor gear.
 */
export function SurvivorModel({ pose, jacket, isCalm, onBones }: SurvivorModelProps) {
  const gltf = useGLTF(SURVIVOR_MODEL);
  const root = useRef<Group>(null);
  const scene = useMemo(() => {
    const copy = cloneSkinned(gltf.scene);
    copy.traverse((node) => {
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
        node.material = regrade(material, TROUSERS, 'bottom');
      else if (name.includes('Footwear')) node.material = regrade(material, BOOTS, 'boots');
    });
    addBeanie(copy);
    return copy;
  }, [gltf.scene, jacket]);

  const bones = useMemo(() => {
    const map = new Map<string, Bone>();
    scene.traverse((node) => {
      if ((node as Bone).isBone) map.set(node.name, node as Bone);
    });
    return map;
  }, [scene]);
  const rest = useMemo(
    () => new Map([...bones].map(([name, bone]) => [name, bone.quaternion.clone()])),
    [bones],
  );
  const spec = POSES[pose];

  const applyPose = (time: number) => {
    const group = root.current;
    if (!group) return;
    const calm = isCalm();
    for (const [name, bone] of bones) bone.quaternion.copy(rest.get(name)!);
    for (const [name, direction] of Object.entries(spec.aims)) {
      const bone = bones.get(name);
      if (!bone) continue;
      let dir = direction;
      if (pose === 'waving' && !calm && (name === 'RightForeArm' || name === 'RightArm')) {
        const sway = Math.sin(time * 5) * (name === 'RightForeArm' ? 0.5 : 0.18);
        dir = [direction[0] + sway, direction[1], direction[2]];
      }
      if (pose === 'waving' && calm && name.startsWith('Right'))
        dir = ARMS_DOWN[name as keyof typeof ARMS_DOWN];
      aimBone(group, bone, dir);
    }
    // Breathing.
    const chest = bones.get('Spine2');
    if (chest) chest.rotateX(Math.sin(time * (calm ? 1.4 : 2.2)) * 0.025);
  };

  useLayoutEffect(() => applyPose(0));
  useLayoutEffect(() => onBones?.(bones), [bones, onBones]);
  useFrame(({ clock }) => applyPose(clock.elapsedTime));

  return (
    <group
      ref={root}
      position={spec.offset as [number, number, number]}
      rotation-x={spec.rotationX}
    >
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(SURVIVOR_MODEL);
