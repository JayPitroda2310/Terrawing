import { useEnvironment } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import type { EnvironmentDefinition } from '@/data/environments/environmentSchema';
import type { GraphicsProfile } from '@/data/graphics';
import { SKY_HDRI } from '@/data/visualAssets';
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
import { setAirflowSampler, type AirflowSampler } from './airflow';
import { getVegetation } from './VegetationPlacer';
import { FloodWater, Water } from './Water';
import { BurntTrees } from './BurntTrees';
import { GrassField } from './GrassField';

/**
 * Development-only profiling switch: `?disable=trees,rocks,terrain,sky,water,mist,rain,structures`
 * removes scene layers so their frame cost can be measured.
 */
const DISABLED: ReadonlySet<string> = new Set(
  import.meta.env.DEV && typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('disable') ?? '').split(',')
    : [],
);
const on = (layer: string) => !DISABLED.has(layer);

interface WorldProps {
  environment: EnvironmentDefinition;
  terrain: TerrainQuery;
  weather: WeatherSystem;
  graphics: GraphicsProfile;
  chargingPads: ReadonlySet<string>;
  getFocus: () => { x: number; y: number; z: number };
  /** TerraWing's rotor downwash source (position and 0..1 strength), when a vehicle is present. */
  getRotorWash?: () => { x: number; y: number; z: number; strength: number } | null;
}

/** Radius (m) and peak speed (m/s) of the rotor downwash felt by flags and windsocks. */
const WASH_RADIUS = 20;
const WASH_SPEED = 16;
const WASH_DEPTH = 30;

/** Static environment: terrain, water, vegetation, structures, sky, lighting and weather visuals. */
export function World({
  environment,
  terrain,
  weather,
  graphics,
  chargingPads,
  getFocus,
  getRotorWash,
}: WorldProps) {
  const vegetation = useMemo(() => getVegetation(environment, terrain), [environment, terrain]);
  const getFlash = () => weather.flash;
  const getWind = () => weather.wind;
  const getFogDensity = useMemo(() => () => weather.fogDensity, [weather]);
  const getDaylight = () => weather.daylight;
  // Air movement at a point: weather wind plus the rotor downwash spreading out along the ground.
  const getAirflow = useMemo<AirflowSampler>(() => {
    return (x, y, z, out: Vector3) => {
      const wind = weather.wind;
      out.set(wind.x, 0, wind.z);
      const wash = getRotorWash?.();
      if (!wash || wash.strength <= 0) return out;
      const dx = x - wash.x;
      const dz = z - wash.z;
      const below = wash.y - y;
      const distance = Math.hypot(dx, dz);
      if (distance > WASH_RADIUS || below < -3 || below > WASH_DEPTH) return out;
      const falloff = (1 - distance / WASH_RADIUS) * (1 - Math.max(0, below) / WASH_DEPTH);
      const speed = WASH_SPEED * wash.strength * falloff;
      out.x += (dx / (distance + 0.5)) * speed;
      out.z += (dz / (distance + 0.5)) * speed;
      out.y -= speed * 0.4;
      return out;
    };
  }, [weather, getRotorWash]);
  useEffect(() => {
    setAirflowSampler(getAirflow);
    return () => setAirflowSampler(null);
  }, [getAirflow]);
  const lighting = environment.lighting;
  const skyMap = useEnvironment({ files: SKY_HDRI[graphics.hdrSky] });

  return (
    <group>
      <Lighting
        lighting={lighting}
        shadows={graphics.shadows}
        shadowMapSize={graphics.shadowMapSize}
        getFocus={getFocus}
        getFlash={getFlash}
        getDaylight={getDaylight}
        environmentMap={skyMap}
        environmentIntensity={lighting.environmentIntensity}
      />
      {on('sky') && (
        <Sky
          map={skyMap}
          fogColor={lighting.fogColor}
          intensity={lighting.skyIntensity}
          getFlash={getFlash}
          getDaylight={getDaylight}
        />
      )}
      <Fog color={lighting.fogColor} getDensity={getFogDensity} />
      {on('mountains') && (
        <DistantMountains
          seed={environment.seed}
          fogColor={lighting.fogColor}
          fogDensity={weather.fogDensity}
        />
      )}
      {on('terrain') && (
        <Terrain
          terrain={terrain}
          receiveShadow={graphics.shadows}
          textureSize={graphics.terrainTextureSize}
        />
      )}
      {on('water') && <Water terrain={terrain} getRain={() => weather.rainIntensity} />}
      {on('water') && environment.flood && (
        <FloodWater
          level={environment.flood.level}
          size={environment.size * 1.1}
          getLevel={() => terrain.data.floodLevel ?? environment.flood!.level}
        />
      )}
      {on('roads') && <Roads terrain={terrain} />}
      {on('trees') && (
        <Trees
          layout={vegetation}
          fraction={graphics.treeFraction}
          lodDistance={graphics.treeLodDistance}
          castShadow={graphics.shadows && graphics.treeShadows}
        />
      )}
      {on('trees') && vegetation.burntTreeCount > 0 && (
        <BurntTrees layout={vegetation} castShadow={graphics.shadows && graphics.treeShadows} />
      )}
      {on('grass') && graphics.grassCount > 0 && (
        <GrassField
          terrain={terrain}
          count={graphics.grassCount}
          radius={graphics.grassRadius}
          getWind={getWind}
        />
      )}
      {on('rocks') && <Rocks layout={vegetation} castShadow={graphics.shadows} />}
      {on('structures') && (
        <Structures
          environment={environment}
          terrain={terrain}
          chargingPads={chargingPads}
          getWind={getWind}
          getAirflow={getAirflow}
        />
      )}
      {graphics.mist && on('mist') && <Mist terrain={terrain} color={lighting.fogColor} />}
      {on('rain') && (
        <Rain
          drops={graphics.rainDrops}
          intensity={weather.maxRainIntensity}
          getIntensity={() => weather.rainIntensity}
          getWind={getWind}
          terrain={terrain}
        />
      )}
    </group>
  );
}
