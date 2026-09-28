import type { ReactNode } from 'react';
import type {
  EnvironmentDefinition,
  StructureDefinition,
} from '@/data/environments/environmentSchema';
import { DEG2RAD } from '@/utils/math/scalar';
import { Bridge } from './Bridge';
import { Antenna, Pad } from './Buildings';
import { DomeTent, RescueTent, ShippingContainer } from './Tents';
import { Floodlight } from './Lights';
import { Cabin, CollapsedHouse, House } from './Houses';
import { Flag, Windsock, type AirflowSampler } from './WindObjects';
import { CarWreck, DebrisPile, FallenLogs, LooseDebris, RockShelter } from './Debris';
import type { TerrainQuery } from './TerrainQuery';

interface StructuresProps {
  environment: EnvironmentDefinition;
  terrain: TerrainQuery;
  chargingPads: ReadonlySet<string>;
  getWind: () => { x: number; z: number };
  getAirflow: AirflowSampler;
}

function hashSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return hash >>> 0;
}

/** Instantiates every data-defined structure at its terrain position. */
export function Structures({ environment, terrain, chargingPads, getAirflow }: StructuresProps) {
  return (
    <group>
      {environment.structures.map((structure) => {
        const [x, z] = structure.position;
        if (structure.kind === 'bridge') {
          const p = structure.params;
          const fromX = p.fromX ?? x - 20;
          const fromZ = p.fromZ ?? z;
          const toX = p.toX ?? x + 20;
          const toZ = p.toZ ?? z;
          return (
            <Bridge
              key={structure.id}
              from={{ x: fromX, y: terrain.heightAt(fromX, fromZ), z: fromZ }}
              to={{ x: toX, y: terrain.heightAt(toX, toZ), z: toZ }}
            />
          );
        }
        const y = terrain.heightAt(x, z) + structure.elevation;
        return (
          <group
            key={structure.id}
            position={[x, y, z]}
            rotation={[0, -structure.rotationDeg * DEG2RAD, 0]}
            scale={structure.scale}
          >
            {renderStructure(
              structure,
              chargingPads,
              getAirflow,
              environment.lighting.night,
              localGround(terrain, x, z, y, structure.rotationDeg, structure.scale),
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Terrain height under a point given in a structure's local space, relative to the structure's
 * origin. Lets props (fallen logs, debris) rest on sloping ground.
 */
export type LocalGround = (localX: number, localZ: number) => number;

function localGround(
  terrain: TerrainQuery,
  originX: number,
  originZ: number,
  originY: number,
  rotationDeg: number,
  scale: number,
): LocalGround {
  const angle = -rotationDeg * DEG2RAD;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (lx, lz) => {
    const wx = originX + (lx * cos + lz * sin) * scale;
    const wz = originZ + (-lx * sin + lz * cos) * scale;
    return (terrain.heightAt(wx, wz) - originY) / scale;
  };
}

function renderStructure(
  structure: StructureDefinition,
  chargingPads: ReadonlySet<string>,
  getAirflow: AirflowSampler,
  night: boolean,
  ground: LocalGround,
): ReactNode {
  const seed = hashSeed(structure.id);
  switch (structure.kind) {
    case 'cabin':
      return <Cabin />;
    case 'tent':
      if ((structure.params.style ?? 0) === 1) return <DomeTent variant={seed} />;
      return (
        <RescueTent
          marking={
            structure.id.includes('medical')
              ? 'medical'
              : structure.id.includes('command')
                ? 'command'
                : 'supply'
          }
        />
      );
    case 'container':
      return <ShippingContainer />;
    case 'antenna':
      return <Antenna height={structure.params.height ?? 25} />;
    case 'floodlight':
      return <Floodlight night={night} />;
    case 'helipad':
    case 'chargingPad':
      return (
        <Pad
          kind="helipad"
          charging={chargingPads.has(structure.id) || structure.kind === 'chargingPad'}
        />
      );
    case 'landingZone':
      return <Pad kind="extraction" charging={chargingPads.has(structure.id)} />;
    case 'windsock':
      return <Windsock getAirflow={getAirflow} />;
    case 'flag':
      return <Flag getAirflow={getAirflow} />;
    case 'house':
      return <House variant={seed % 7} flatRoof={(structure.params.flatRoof ?? 0) > 0} />;
    case 'collapsedHouse':
      return <CollapsedHouse variant={seed % 7} />;
    case 'carWreck':
      return <CarWreck />;
    case 'debrisPile':
      return <DebrisPile radius={structure.params.radius ?? 12} seed={seed} ground={ground} />;
    case 'fallenLogs':
      return <FallenLogs seed={seed} ground={ground} />;
    case 'looseDebris':
      return (
        <LooseDebris
          seed={seed}
          count={structure.params.count ?? 5}
          radius={structure.params.radius ?? 5}
        />
      );
    case 'rockShelter':
      return <RockShelter />;
    case 'bridge':
      return null;
  }
}
