import type { EnvironmentDefinition } from './environmentSchema';
import { EARTHQUAKE_TOWN } from './earthquakeTown';
import { FOREST_FIRE } from './forestFire';
import { MOUNTAIN_COLLAPSE } from './mountainCollapse';
import { NIGHT_RIDGE } from './nightRidge';
import { RIVER_FLOOD } from './riverFlood';

export type { EnvironmentDefinition } from './environmentSchema';

/** Registry of environments available to missions, keyed by id. */
const ENVIRONMENTS: Readonly<Record<string, EnvironmentDefinition>> = {
  [MOUNTAIN_COLLAPSE.id]: MOUNTAIN_COLLAPSE,
  [RIVER_FLOOD.id]: RIVER_FLOOD,
  [FOREST_FIRE.id]: FOREST_FIRE,
  [EARTHQUAKE_TOWN.id]: EARTHQUAKE_TOWN,
  [NIGHT_RIDGE.id]: NIGHT_RIDGE,
};

export function getEnvironment(id: string): EnvironmentDefinition {
  const environment = ENVIRONMENTS[id];
  if (!environment) throw new Error(`Unknown environment "${id}"`);
  return environment;
}
