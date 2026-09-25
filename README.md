# TerraWing: Rescue Ops

A browser-based 3D search-and-rescue game. You pilot **TerraWing**, a hybrid drone/rover, through
**Mission 01 — Mountain Collapse**: fly, scan, land, transform, drive, rescue, extract.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production bundle
npm test             # unit + UI tests (Vitest)
npm run test:e2e     # browser flow tests (Playwright; run `npx playwright install chromium` once)
npm run lint
```

## Controls

| Action                 | Flight           | Rover            |
| ---------------------- | ---------------- | ---------------- |
| Forward / back         | W / S            | W / S            |
| Yaw / steer            | A / D            | A / D            |
| Ascend / brake         | Space            | Space            |
| Descend                | Shift            | —                |
| Scanner pulse          | Q                | Q                |
| Transform / interact   | E                | E                |
| Pause                  | Esc              | Esc              |
| Camera                 | Mouse (click to capture) |          |
| Debug panel (dev only) | F3               | F3               |

Keys can be rebound in **Settings → Controls**. `E` is context-sensitive: it interacts when a prompt
is shown, otherwise it transforms.

## How Mission 01 plays

- Start at the rescue base in rover mode. The **medical kit** is next to the pad; one hiker is injured.
- Fly out and **scan** over the disaster zone. Far targets show as unknown signals until you get closer.
- **Survivor A** is by the landslide on the road (signal flare, easy to spot).
- **Survivor B** is under the forest canopy. You cannot land among trees: set down in the cabin clearing
  and drive the forest path.
- **Survivor C** is in a rock shelter beyond the collapsed bridge, inside a rockfall zone where rotor
  wash damages TerraWing. Land outside the zone and drive in. The ridge blocks the relay link, so climb
  to restore it.
- Recharge on the base pad or the extraction LZ. Park on the LZ in rover mode to extract.

## Architecture

React renders UI and high-level state; gameplay runs in plain TypeScript at a fixed 60 Hz step.

```
src/
  app/            App shell, screen routes (code-split), GameManager context, dev hooks
  data/           Pure data (Zod-validated): missions, vehicle config, environments, surfaces, graphics
  game/
    core/         GameManager (orchestration), GameSession (one mission run), state machines,
                  typed EventBus, telemetry, GameLoop (fixed step before each physics step)
    terrawing/    Vehicle state, Flight/Rover/Transformation controllers, procedural model,
                  VehicleVisual (GLB swap point)
    physics/      VehicleBody interface + Rapier adapter, bulk static colliders
    environment/  Procedural terrain (one grid shared by render, physics and CPU queries),
                  vegetation, water, roads, structures, sky, lighting
    systems/      Battery, damage, signal, weather, hazards, interaction, radio
    scanner/      Pulse logic, targets, in-world markers
    missions/     Mission schema/validation, MissionManager, objectives, rating
    rescue/       Survivors, supplies, rescue zones
    camera/       Follow camera, cinematic shots, camera rig
    audio/        Howler AudioManager, sound manifest, procedural placeholder synthesis
    effects/      Particles (dust, smoke, sparks), GPU rain, mist, scan wave, post-processing
    input/        Action-based input (keyboard, pointer-lock mouse, gamepad)
  services/save/  SaveRepository interface + localStorage implementation
  store/          Zustand stores (screen state, HUD telemetry, objectives, settings, progress)
  ui/             HUD, menus, mission screens, dev debug panel
```

Key decisions:

- **High-frequency state stays out of React.** Physics and vehicle state live in `GameSession`. The HUD
  gets a throttled ~10 Hz telemetry snapshot; the compass and markers animate via refs.
- **Physics behind an interface.** `VehicleBody` lets `GameSession` run against a fake body in unit
  tests (`src/game/core/GameSession.test.ts` plays the mission loop headlessly).
- **Data-driven.** Tuning lives in `src/data`. Missions reference zones, survivors and objectives by id,
  and `validateMission` rejects dangling references before gameplay starts.

## Extending

- **New mission:** add a `MissionInput` in `src/data/missions/`, register it in `data/missions/index.ts`
  and `MISSION_CATALOG`. New environments go in `src/data/environments/`.
- **Real vehicle model:** set `visual: { kind: 'gltf', url, scale }` in `data/vehicles/terrawing.ts`. Name
  rotor nodes `rotor_*`; map further bones to the rig parameters (`armExtension`, `wheelDeploy`,
  `bodyLift`, `rotorSpeed`, `sensorMast`). If the model fails to load, the procedural model is used.
- **Real audio:** drop files in `public/audio/` and add `src: ['/audio/…']` to the entry in
  `game/audio/SoundEffects.ts`. Missing or broken files fall back to the synthesized placeholder.
- **Cloud saves:** implement `SaveRepository` (e.g. Supabase) and pass it to `SaveService`.

## Performance notes

Measured on an Intel UHD integrated GPU at 1920×1080: Low and Medium run at about 55 fps with dynamic
resolution, at roughly 140–170 draw calls. **High** adds bloom and multisampled post-processing and
is intended for discrete GPUs. Trees are instanced in spatial chunks with distance LOD; rain is fully
GPU-animated; colliders for vegetation are created in bulk on one fixed body.
