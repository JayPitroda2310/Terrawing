import { TERRAWING_TW1 } from './terrawing';
import type { VehicleConfig } from './vehicleSchema';

export type { VehicleConfig, RigState, CameraProfile, TransformPhaseConfig } from './vehicleSchema';

const VEHICLES: Readonly<Record<string, VehicleConfig>> = {
  [TERRAWING_TW1.id]: TERRAWING_TW1,
};

export function getVehicle(id: string): VehicleConfig {
  const vehicle = VEHICLES[id];
  if (!vehicle) throw new Error(`Unknown vehicle "${id}"`);
  return vehicle;
}
