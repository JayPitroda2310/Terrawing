import type { EnvironmentDefinition } from './environmentSchema';
import { MOUNTAIN_COLLAPSE } from './mountainCollapse';

export type { EnvironmentDefinition } from './environmentSchema';

/** Registry of environments available to missions, keyed by id. */
const ENVIRONMENTS: Readonly<Record<string, EnvironmentDefinition>> = {
  [MOUNTAIN_COLLAPSE.id]: MOUNTAIN_COLLAPSE,
};

export function getEnvironment(id: string): EnvironmentDefinition {
  const environment = ENVIRONMENTS[id];
  if (!environment) throw new Error(`Unknown environment "${id}"`);
  return environment;
}
