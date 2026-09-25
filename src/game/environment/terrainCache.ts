import type { EnvironmentDefinition } from '@/data/environments/environmentSchema';
import { generateTerrain } from './TerrainGenerator';
import { TerrainQuery } from './TerrainQuery';

const cache = new Map<string, TerrainQuery>();

/** Terrain is generated once per environment and shared by the menu backdrop and missions. */
export function getTerrain(environment: EnvironmentDefinition): TerrainQuery {
  let query = cache.get(environment.id);
  if (!query) {
    query = new TerrainQuery(generateTerrain(environment));
    cache.set(environment.id, query);
  }
  return query;
}
