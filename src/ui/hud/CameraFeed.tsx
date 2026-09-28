import type { GameSession } from '@/game/core/GameSession';
import type { Telemetry } from '@/game/core/Telemetry';
import { formatKeyCode } from '@/game/input/actions';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTime } from '@/utils/helpers/format';

const RAD2DEG = 180 / Math.PI;

const LABELS = {
  nose: { id: 'CAM 1', name: 'NOSE FPV', spec: '4K · 60 FPS · WIDE' },
  gimbal: { id: 'CAM 2', name: 'BELLY GIMBAL', spec: '3-AXIS STAB · 4K · 30 FPS' },
} as const;

const signed = (value: number, digits = 3) =>
  `${value < 0 ? '−' : '+'}${Math.abs(Math.round(value)).toString().padStart(digits, '0')}`;

/**
 * Camera-feed overlay while looking through TerraWing's own cameras: recording tag and camera
 * id, frame corners, a reticle (with gimbal elevation / azimuth and ground range for the gimbal),
 * compact flight data, and the lens vignette and scanlines of a real video downlink.
 */
export function CameraFeed({ session, telemetry }: { session: GameSession; telemetry: Telemetry }) {
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  const view = session.cameraView;
  if (view === 'chase') return null;
  const label = LABELS[view];
  const tilt = session.cameraAim.tilt;
  const pan = session.cameraAim.pan;
  const range = view === 'gimbal' && tilt < -0.05 ? telemetry.altitudeAGL / Math.sin(-tilt) : null;
  const key = formatKeyCode(bindings.camera[0] ?? 'KeyC');
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden data-testid="camera-feed">
      {/* Lens vignette and downlink scanlines. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.55)_100%)]" />
      <div className="hud-scanlines absolute inset-0 opacity-40" />
      {/* Frame corners. */}
      {(
        [
          'top-[14%] left-[22%]',
          'top-[14%] right-[22%]',
          'bottom-[20%] left-[22%]',
          'bottom-[20%] right-[22%]',
        ] as const
      ).map((pos, i) => (
        <div
          key={pos}
          className={`absolute h-7 w-7 border-white/70 ${pos} ${
            [
              'border-t-2 border-l-2',
              'border-t-2 border-r-2',
              'border-b-2 border-l-2',
              'border-b-2 border-r-2',
            ][i]
          }`}
        />
      ))}
      {/* Recording tag and camera id. */}
      <div className="absolute top-[15%] left-1/2 flex -translate-x-1/2 items-center gap-3 font-mono text-[11px] tracking-[0.18em] text-white/90">
        <span className="flex items-center gap-1.5 text-ops-red">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ops-red" />
          REC
        </span>
        <span className="font-semibold text-brand">{label.id}</span>
        <span>{label.name}</span>
        <span className="text-white/50">T+ {formatTime(telemetry.missionTime)}</span>
      </div>
      <div className="absolute top-[18.5%] left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.2em] text-white/45">
        {label.spec}
      </div>
      {/* Reticle. */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        {view === 'gimbal' ? (
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full border border-white/55" />
            <div className="absolute top-1/2 left-[-18px] h-px w-[30px] bg-white/80" />
            <div className="absolute top-1/2 right-[-18px] h-px w-[30px] bg-white/80" />
            <div className="absolute top-[-18px] left-1/2 h-[30px] w-px bg-white/80" />
            <div className="absolute bottom-[-18px] left-1/2 h-[30px] w-px bg-white/80" />
            <div className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
          </div>
        ) : (
          <div className="relative h-8 w-8 opacity-80">
            <div className="absolute top-1/2 left-0 h-px w-2.5 bg-white" />
            <div className="absolute top-1/2 right-0 h-px w-2.5 bg-white" />
            <div className="absolute top-0 left-1/2 h-2.5 w-px bg-white" />
            <div className="absolute bottom-0 left-1/2 h-2.5 w-px bg-white" />
          </div>
        )}
      </div>
      {view === 'gimbal' && (
        <div className="absolute top-[calc(50%+74px)] left-1/2 flex -translate-x-1/2 gap-5 font-mono text-[11px] tracking-[0.15em] text-white/85">
          <span>EL {signed(tilt * RAD2DEG, 2)}°</span>
          <span>AZ {signed(-pan * RAD2DEG)}°</span>
          <span>RNG {range !== null && range < 999 ? `${range.toFixed(0)} m` : '— — —'}</span>
        </div>
      )}
      {/* Flight data strip and view hint. */}
      <div className="absolute bottom-[21%] left-1/2 flex -translate-x-1/2 gap-6 font-mono text-[11px] tracking-[0.15em] text-white/80">
        <span>ALT {telemetry.altitudeAGL.toFixed(1)} m</span>
        <span>SPD {telemetry.speedKmh.toFixed(0)} km/h</span>
        <span>HDG {Math.round(telemetry.headingDeg).toString().padStart(3, '0')}°</span>
      </div>
      <div className="absolute bottom-[17%] left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-white/50">
        [{key}] CHANGE VIEW{view === 'gimbal' ? ' · MOUSE: PAN / TILT' : ''}
      </div>
    </div>
  );
}
