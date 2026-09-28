import { Panel } from '@/components/common/Panel';
import type { GameSession } from '@/game/core/GameSession';
import type { Telemetry } from '@/game/core/Telemetry';
import { formatKeyCode } from '@/game/input/actions';
import { useMissionStore } from '@/store/missionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTelemetryStore } from '@/store/telemetryStore';
import { formatTime, toGpsString } from '@/utils/helpers/format';
import { BatteryIndicator } from './BatteryIndicator';
import { CameraFeed } from './CameraFeed';
import { Compass } from './Compass';
import { FlightHUD } from './FlightHUD';
import { IntegrityIndicator } from './IntegrityIndicator';
import { ObjectiveTracker } from './ObjectiveTracker';
import { RoverHUD } from './RoverHUD';
import { ScannerIndicator } from './ScannerIndicator';
import { SignalIndicator } from './SignalIndicator';

/** In-mission heads-up display. Layout keeps corners separate so nothing overlaps at 1280×720. */
export function HUD({ session }: { session: GameSession }) {
  const telemetry = useTelemetryStore((s) => s.telemetry);
  const cinematic = telemetry.substate === 'CINEMATIC';
  const interference = telemetry.signalState === 'unstable';

  if (cinematic) return <CinematicOverlay session={session} />;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 font-sans text-ops-text ${interference ? 'animate-hud-flicker' : ''}`}
      data-testid="hud"
    >
      <DamageFlash active={telemetry.recentlyDamaged} />
      {telemetry.signalState !== 'good' && (
        <div
          className={`hud-scanlines absolute inset-0 ${interference ? 'opacity-70' : 'opacity-30'}`}
          aria-hidden
        />
      )}

      {/* Top-left: mission + objectives */}
      <div className="absolute top-5 left-5 flex flex-col gap-2">
        <div className="bezel flex w-[300px] items-center gap-3 px-3.5 py-2 font-mono text-[11px] text-ops-dim [--chamfer:8px]">
          <span className="font-semibold tracking-[0.2em] text-ops-orange">
            {session.mission.code}
          </span>
          <span>T+ {formatTime(telemetry.missionTime)}</span>
          <span className={telemetry.timeRemaining < 120 ? 'text-ops-red' : ''}>
            LIMIT {formatTime(telemetry.timeRemaining)}
          </span>
        </div>
        <ObjectiveTracker />
      </div>

      {/* Top-centre: compass + warnings */}
      <div className="absolute top-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-8">
        <Compass session={session} />
        <Warnings telemetry={telemetry} />
      </div>

      {/* Top-right: link + position */}
      <div className="absolute top-5 right-5 w-[250px]">
        <Panel dense>
          <SignalIndicator value={telemetry.signal} state={telemetry.signalState} />
          <div className="mt-2 border-t border-ops-line pt-2 font-mono text-[10px] leading-relaxed text-ops-dim">
            <div className="flex justify-between">
              <span>MODE</span>
              <span className="font-semibold text-ops-text">
                {telemetry.mode === 'FLIGHT' ? '✈ FLIGHT' : '⛭ ROVER'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>GPS</span>
              <span className="text-ops-text">
                {interference
                  ? '— — — —'
                  : toGpsString(telemetry.x, telemetry.z, session.environment.geo)}
              </span>
            </div>
            {telemetry.passengers > 0 && (
              <div className="flex justify-between">
                <span>PATIENTS ABOARD</span>
                <span
                  className={
                    telemetry.patientCondition < 35
                      ? 'animate-pulse-soft text-ops-red'
                      : telemetry.patientCondition < 70
                        ? 'text-ops-amber'
                        : 'text-ops-green'
                  }
                >
                  {telemetry.passengers} · {Math.round(telemetry.patientCondition)}%
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>SURVIVORS</span>
              <span className="text-ops-text">
                {telemetry.survivorsSecured}/{telemetry.survivorsTotal} SECURED
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Right: event feed */}
      <Feed />

      {/* Bottom-left: power + integrity */}
      <div className="absolute bottom-5 left-5 w-[280px]">
        <Panel dense className="space-y-2">
          <div className="flex justify-around">
            <BatteryIndicator
              value={telemetry.battery}
              level={telemetry.batteryLevel}
              charging={telemetry.charging}
              rate={telemetry.batteryRate}
            />
            <IntegrityIndicator value={telemetry.integrity} level={telemetry.integrityLevel} />
          </div>
          {telemetry.payload && (
            <div className="border-t border-ops-line pt-2 font-mono text-[10px] tracking-[0.15em] text-ops-blue">
              ■ PAYLOAD · {telemetry.payload}
            </div>
          )}
        </Panel>
      </div>

      {/* Bottom-right: mode telemetry + scanner */}
      <div className="absolute right-5 bottom-5 w-[340px]">
        <Panel dense className="space-y-3">
          {telemetry.mode === 'FLIGHT' ? (
            <FlightHUD telemetry={telemetry} />
          ) : (
            <RoverHUD telemetry={telemetry} />
          )}
          <div className="border-t border-ops-line pt-3">
            <ScannerIndicator
              readiness={telemetry.scannerReadiness}
              active={telemetry.scannerActive}
            />
          </div>
        </Panel>
      </div>

      {/* Bottom-centre: radio, prompts, progress */}
      <div className="absolute bottom-6 left-1/2 flex w-[520px] -translate-x-1/2 flex-col items-center gap-3">
        <RadioLine />
        <ActionArea telemetry={telemetry} />
      </div>

      {session.cameraView === 'chase' && <Reticle />}
      <CameraFeed session={session} telemetry={telemetry} />
    </div>
  );
}

function Warnings({ telemetry }: { telemetry: Telemetry }) {
  if (telemetry.warnings.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-1" role="alert" aria-live="assertive">
      {telemetry.warnings.slice(0, 3).map((w) => (
        <div
          key={w.id}
          className={`flex items-center gap-2 border px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] backdrop-blur-sm ${
            w.severity === 'critical'
              ? 'animate-pulse-soft border-ops-red/70 bg-ops-red/15 text-ops-red'
              : w.severity === 'warning'
                ? 'border-ops-amber/60 bg-ops-amber/10 text-ops-amber'
                : 'border-ops-line-strong bg-ops-panel text-ops-text'
          }`}
        >
          <span aria-hidden>▲</span>
          {w.text}
        </div>
      ))}
    </div>
  );
}

function Feed() {
  const feed = useMissionStore((s) => s.feed);
  const toneClass = {
    info: 'border-ops-line-strong text-ops-text',
    success: 'border-ops-green/60 text-ops-green',
    warning: 'border-ops-amber/60 text-ops-amber',
    danger: 'border-ops-red/60 text-ops-red',
  } as const;
  const toneGlyph = { info: '›', success: '✓', warning: '!', danger: '▲' } as const;
  return (
    <div
      className="absolute top-44 right-5 flex w-[300px] flex-col items-end gap-1.5"
      aria-live="polite"
    >
      {feed.map((item) => (
        <div
          key={item.id}
          className={`animate-rise-in border-l-2 bg-ops-panel px-3 py-1.5 font-mono text-[10.5px] leading-snug tracking-wide backdrop-blur-sm ${toneClass[item.tone]}`}
        >
          <span className="mr-1.5" aria-hidden>
            {toneGlyph[item.tone]}
          </span>
          {item.text}
        </div>
      ))}
    </div>
  );
}

function RadioLine() {
  const radio = useMissionStore((s) => s.radio);
  const subtitles = useSettingsStore((s) => s.settings.showSubtitles);
  if (!radio || !subtitles) return null;
  return (
    <div
      key={radio.id}
      className="animate-rise-in max-w-[520px] border border-ops-line bg-ops-panel-strong px-4 py-2 text-center backdrop-blur"
    >
      <span className="mr-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-ops-cyan">
        ◉ {radio.speaker}
      </span>
      <span className="text-[13px] text-ops-text">{radio.text}</span>
    </div>
  );
}

function ActionArea({ telemetry }: { telemetry: Telemetry }) {
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  const interactKey = formatKeyCode(bindings.interact[0] ?? 'KeyE');

  if (telemetry.substate === 'TRANSFORMING') {
    return (
      <ProgressCard
        title={telemetry.mode === 'FLIGHT' ? 'TRANSFORMING → ROVER' : 'TRANSFORMING → FLIGHT'}
        label={telemetry.transformLabel ?? ''}
        progress={telemetry.transformProgress}
        tone="orange"
      />
    );
  }
  if (telemetry.interaction) {
    return (
      <ProgressCard
        title="RESCUE OPERATION"
        label={telemetry.interaction.label}
        progress={telemetry.interaction.progress}
        tone="green"
      />
    );
  }
  if (telemetry.extractionProgress > 0) {
    return (
      <ProgressCard
        title="EXTRACTION"
        label="HOLD POSITION ON THE LZ"
        progress={telemetry.extractionProgress}
        tone="green"
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      {telemetry.prompt && (
        <div
          className={`flex items-center gap-3 border bg-ops-panel-strong px-4 py-2 font-mono text-xs font-semibold tracking-[0.15em] ${
            telemetry.prompt.blockedReason
              ? 'border-ops-amber/60 text-ops-amber'
              : 'border-ops-green/70 text-ops-green'
          }`}
        >
          {telemetry.prompt.blockedReason ? (
            <>
              <span>{telemetry.prompt.label}</span>
              <span className="text-ops-dim">—</span>
              <span>{telemetry.prompt.blockedReason}</span>
            </>
          ) : (
            <>
              <Key>{interactKey}</Key>
              <span>{telemetry.prompt.label}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="mr-1 inline-flex min-w-5 items-center justify-center border border-ops-line-strong bg-black/40 px-1 py-0.5 font-mono text-[10px] text-ops-text">
      {children}
    </kbd>
  );
}

function ProgressCard({
  title,
  label,
  progress,
  tone,
}: {
  title: string;
  label: string;
  progress: number;
  tone: 'orange' | 'green';
}) {
  const color = tone === 'orange' ? 'bg-ops-orange' : 'bg-ops-green';
  const text = tone === 'orange' ? 'text-ops-orange' : 'text-ops-green';
  return (
    <div
      className="w-[380px] border border-ops-line bg-ops-panel-strong px-4 py-3 backdrop-blur"
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-label={title}
    >
      <div className="mb-1 flex justify-between font-mono text-[10px] font-semibold tracking-[0.2em]">
        <span className={text}>{title}</span>
        <span className="tabular text-ops-dim">{Math.round(progress * 100)}%</span>
      </div>
      <div className="h-1 w-full bg-white/10">
        <div
          className={`h-full ${color} transition-[width] duration-150`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="mt-1.5 font-mono text-[11px] text-ops-text">{label}</div>
    </div>
  );
}

function DamageFlash({ active }: { active: boolean }) {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}
      style={{ boxShadow: 'inset 0 0 140px rgb(255 60 50 / 0.45)' }}
      aria-hidden
    />
  );
}

function Reticle() {
  return (
    <div
      className="absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 opacity-40"
      aria-hidden
    >
      <div className="absolute top-1/2 left-0 h-px w-1.5 bg-ops-text" />
      <div className="absolute top-1/2 right-0 h-px w-1.5 bg-ops-text" />
      <div className="absolute top-0 left-1/2 h-1.5 w-px bg-ops-text" />
      <div className="absolute bottom-0 left-1/2 h-1.5 w-px bg-ops-text" />
    </div>
  );
}

function CinematicOverlay({ session }: { session: GameSession }) {
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  const state = session.gameplay.state;
  const intro = state.kind === 'CINEMATIC' && state.shot === 'missionIntro';
  const handover =
    state.kind === 'CINEMATIC' && state.shot === 'handover' ? session.handover : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="cinematic">
      <div className="absolute inset-x-0 top-0 h-[9vh] bg-black/85 animate-fade-in" />
      <div className="absolute inset-x-0 bottom-0 h-[9vh] bg-black/85 animate-fade-in" />
      <div className="absolute bottom-[12vh] left-12 animate-rise-in">
        <div className="text-[11px] font-semibold tracking-[0.4em] text-ops-orange">
          {session.mission.code}
        </div>
        <div className="text-3xl font-bold tracking-[0.12em] text-ops-text">
          {intro
            ? session.mission.name.toUpperCase()
            : handover
              ? 'EN ROUTE TO HOSPITAL'
              : 'EXTRACTION CONFIRMED'}
        </div>
        <div className="mt-1 font-mono text-xs text-ops-dim">
          {intro
            ? `${session.environment.regionName} · ${session.mission.briefing.weather}`
            : handover
              ? 'Patients in the care of the medical team — en route to Regional Hospital'
              : 'All survivors accounted for'}
        </div>
      </div>
      {(intro || handover) && (
        <div className="absolute right-12 bottom-[12vh] font-mono text-[11px] tracking-[0.2em] text-ops-dim">
          [{formatKeyCode(bindings.interact[0] ?? 'KeyE')}] SKIP
        </div>
      )}
    </div>
  );
}
