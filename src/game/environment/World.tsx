import { useMemo } from 'react';
import type { EnvironmentDefinition } from '@/data/environments/environmentSchema';
import type { GraphicsProfile } from '@/data/graphics';
import { Fog, Mist } from '@/game/effects/Fog';
import { Rain } from '@/game/effects/Rain';
import type { WeatherSystem } from '@/game/systems/WeatherSystem';
import { DistantMountains } from './DistantMountains';
import { Lighting } from './Lighting';
import { Roads } from './Roads';
import { Rocks } from './Rocks';
import { Sky } from './Sky';
import { Structures } from './Structures';
import { Terrain } from './Terrain';
import type { TerrainQuery } from './TerrainQuery';
import { Trees } from './Trees';
import { getVegetation } from './VegetationPlacer';
import { Water } from './Water';

interface WorldProps {
  environment: EnvironmentDefinition;
  terrain: TerrainQuery;
  weather: WeatherSystem;
  graphics: GraphicsProfile;
  chargingPads: ReadonlySet<string>;
  getFocus: () => { x: number; y: number; z: number };
}

/** Static environment: terrain, water, vegetation, structures, sky, lighting and weather visuals. */
export function World({
  environment,
  terrain,
  weather,
  graphics,
  chargingPads,
  getFocus,
}: WorldProps) {
  const vegetation = useMemo(() => getVegetation(environment, terrain), [environment, terrain]);
  const getFlash = () => weather.flash;
  const getWind = () => weather.wind;
  const lighting = environment.lighting;

  return (
    <group>
      <Lighting
        lighting={lighting}
        shadows={graphics.shadows}
        shadowMapSize={graphics.shadowMapSize}
        getFocus={getFocus}
        getFlash={getFlash}
      />
      <Sky skyColor={lighting.skyColor} fogColor={lighting.fogColor} getFlash={getFlash} />
      <Fog color={lighting.fogColor} density={weather.fogDensity} />
      <DistantMountains seed={environment.seed} color="#4c5054" />
      <Terrain terrain={terrain} receiveShadow={graphics.shadows} />
      <Water terrain={terrain} />
      <Roads terrain={terrain} />
      <Trees
        layout={vegetation}
        fraction={graphics.treeFraction}
        lodDistance={graphics.treeLodDistance}
        castShadow={graphics.shadows}
      />
      <Rocks layout={vegetation} castShadow={graphics.shadows} />
      <Structures
        environment={environment}
        terrain={terrain}
        chargingPads={chargingPads}
        getWind={getWind}
      />
      {graphics.mist && <Mist terrain={terrain} color={lighting.fogColor} />}
      <Rain drops={graphics.rainDrops} intensity={weather.rainIntensity} getWind={getWind} />
    </group>
  );
}
