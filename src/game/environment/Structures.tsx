import type { ReactNode } from 'react';
import type {
  EnvironmentDefinition,
  StructureDefinition,
} from '@/data/environments/environmentSchema';
import { DEG2RAD } from '@/utils/math/scalar';
import { Bridge } from './Bridge';
import { Antenna, Cabin, Container, Floodlight, Pad, Tent, Windsock } from './Buildings';
import { CarWreck, DebrisPile, FallenLogs, LooseDebris, RockShelter } from './Debris';
import type { TerrainQuery } from './TerrainQuery';

interface StructuresProps {
  environment: EnvironmentDefinition;
  terrain: TerrainQuery;
  chargingPads: ReadonlySet<string>;
  getWind: () => { x: number; z: number };
}

function hashSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return hash >>> 0;
}

/** Instantiates every data-defined structure at its terrain position. */
export function Structures({ environment, terrain, chargingPads, getWind }: StructuresProps) {
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
            {renderStructure(structure, chargingPads, getWind)}
          </group>
        );
      })}
    </group>
  );
}

function renderStructure(
  structure: StructureDefinition,
  chargingPads: ReadonlySet<string>,
  getWind: () => { x: number; z: number },
): ReactNode {
  const seed = hashSeed(structure.id);
  switch (structure.kind) {
    case 'cabin':
      return <Cabin />;
    case 'tent':
      return <Tent />;
    case 'container':
      return <Container />;
    case 'antenna':
      return <Antenna height={structure.params.height ?? 25} />;
    case 'floodlight':
      return <Floodlight />;
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
      return <Windsock getWind={getWind} />;
    case 'carWreck':
      return <CarWreck />;
    case 'debrisPile':
      return <DebrisPile radius={structure.params.radius ?? 12} seed={seed} />;
    case 'fallenLogs':
      return <FallenLogs seed={seed} />;
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
