import { useEffect, useState, type ReactNode } from 'react';
import { useGameManager } from '@/app/GameManagerContext';
import type { GameAction } from '@/game/input/actions';
import { useSettingsStore } from '@/store/settingsStore';
import { Gauge } from './Gauge';
import { ICONS } from './icons';
import { Keycap } from './keycaps';

const INSTRUMENTS: {
  gauge: Parameters<typeof Gauge>[0];
  text: string;
}[] = [
  {
    gauge: {
      label: 'Airspeed',
      unit: 'km/h',
      value: 64,
      min: 0,
      max: 120,
      major: 20,
      zones: [{ from: 100, to: 120, tone: 'danger' }],
    },
    text: 'Flight speed. Red band: top speed — the drone cannot go faster and drains battery hardest.',
  },
  {
    gauge: {
      label: 'Alt AGL',
      unit: 'm',
      value: 26,
      min: 0,
      max: 150,
      major: 25,
      minor: 5,
      zones: [{ from: 0, to: 4, tone: 'caution' }],
    },
    text: 'Height above the ground under you. Amber: landing height — land and transform below ~14 m.',
  },
  {
    gauge: {
      label: 'Climb',
      unit: 'm/s',
      value: -1.5,
      min: -8,
      max: 8,
      major: 4,
      decimals: 1,
      zones: [{ from: -8, to: -5, tone: 'danger' }],
    },
    text: 'Vertical speed. Needle up: climbing, down: descending. Red: sinking too fast to land safely.',
  },
  {
    gauge: {
      label: 'Speed',
      unit: 'km/h',
      value: 32,
      min: 0,
      max: 70,
      major: 10,
      zones: [{ from: 55, to: 70, tone: 'danger' }],
    },
    text: 'Rover speed. Slow down (red band) on rough ground and in puddles — tyres aquaplane.',
  },
  {
    gauge: {
      label: 'Grip',
      unit: '%',
      value: 78,
      min: 0,
      max: 100,
      major: 25,
      minor: 5,
      zones: [{ from: 0, to: 30, tone: 'caution' }],
    },
    text: 'Tyre grip on the current surface. Amber: wheelspin or sliding — ease off the throttle.',
  },
  {
    gauge: {
      label: 'Battery',
      unit: '%',
      value: 72,
      min: 0,
      max: 100,
      major: 25,
      minor: 5,
      zones: [
        { from: 0, to: 10, tone: 'danger' },
        { from: 10, to: 20, tone: 'caution' },
      ],
    },
    text: 'Charge left. Flying drains it fastest; recharge on the base or LZ pads. Amber: head home.',
  },
  {
    gauge: {
      label: 'Integrity',
      unit: '%',
      value: 88,
      min: 0,
      max: 100,
      major: 25,
      minor: 5,
      zones: [
        { from: 0, to: 25, tone: 'danger' },
        { from: 25, to: 60, tone: 'caution' },
      ],
    },
    text: 'Structural health. Crashes and hazards reduce it; at 0 the mission fails. The alarm speeds up as danger rises.',
  },
];

/** Explains every HUD dial with a live example of it. */
function InstrumentGuide() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2">
      {INSTRUMENTS.map(({ gauge, text }) => (
        <div key={gauge.label} className="flex items-center gap-3 px-2 py-1">
          <div className="shrink-0">
            <Gauge {...gauge} size={78} />
          </div>
          <p className="text-[0.78rem] leading-snug text-[#f3efe7]/75">{text}</p>
        </div>
      ))}
    </div>
  );
}

type Motion =
  | 'altitude'
  | 'rotate'
  | 'fly'
  | 'slide'
  | 'scan'
  | 'land'
  | 'drive'
  | 'steer'
  | 'brake'
  | 'takeoff';

interface Step {
  actions: GameAction[];
  icon: ReactNode;
  label: string;
  detail: string;
  motion: Motion;
}

const DRONE: Step[] = [
  {
    actions: ['ascend', 'descend'],
    icon: ICONS.altitude,
    label: 'Altitude',
    detail: 'Climb and descend',
    motion: 'altitude',
  },
  {
    actions: ['yawLeft', 'yawRight'],
    icon: ICONS.rotate,
    label: 'Rotate',
    detail: 'Turn on the spot',
    motion: 'rotate',
  },
  {
    actions: ['pitchForward', 'pitchBack'],
    icon: ICONS.fly,
    label: 'Fly',
    detail: 'Forward and back',
    motion: 'fly',
  },
  {
    actions: ['rollLeft', 'rollRight'],
    icon: ICONS.slide,
    label: 'Slide',
    detail: 'Strafe sideways',
    motion: 'slide',
  },
  {
    actions: ['scan'],
    icon: ICONS.scan,
    label: 'Scan',
    detail: 'Thermal pulse finds survivors',
    motion: 'scan',
  },
  {
    actions: ['interact'],
    icon: ICONS.transform,
    label: 'Land',
    detail: 'Land and transform to rover',
    motion: 'land',
  },
];

const ROVER: Step[] = [
  {
    actions: ['forward', 'backward'],
    icon: ICONS.drive,
    label: 'Drive',
    detail: 'Throttle and reverse',
    motion: 'drive',
  },
  {
    actions: ['left', 'right'],
    icon: ICONS.steer,
    label: 'Steer',
    detail: 'Turn the front wheels',
    motion: 'steer',
  },
  {
    actions: ['brake'],
    icon: ICONS.brake,
    label: 'Brake',
    detail: 'Stop to assist survivors',
    motion: 'brake',
  },
  {
    actions: ['scan'],
    icon: ICONS.scan,
    label: 'Scan',
    detail: 'Works on wheels too',
    motion: 'scan',
  },
  {
    actions: ['interact'],
    icon: ICONS.transform,
    label: 'Take off',
    detail: 'Transform back to flight',
    motion: 'takeoff',
  },
];

const STEP_MS = 2400;

/** Top-down drone: hull, four ducted rotors (spinning), nose marker. */
function DroneFigure({ spinning = true }: { spinning?: boolean }) {
  return (
    <g>
      {(
        [
          [-34, -34],
          [34, -34],
          [-34, 34],
          [34, 34],
        ] as const
      ).map(([x, y]) => (
        <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
          <line x1={0} y1={0} x2={-x * 0.6} y2={-y * 0.6} stroke="#9aa5ad" strokeWidth="5" />
          <circle r="19" fill="rgb(20 24 28 / 0.9)" stroke="#c9d1d6" strokeWidth="2.5" />
          <g className={spinning ? 'animate-[spin_0.25s_linear_infinite]' : ''}>
            <line x1={-15} y1={0} x2={15} y2={0} stroke="#f3efe7" strokeWidth="2.5" opacity="0.8" />
            <line x1={0} y1={-15} x2={0} y2={15} stroke="#f3efe7" strokeWidth="2.5" opacity="0.5" />
          </g>
        </g>
      ))}
      <rect
        x="-20"
        y="-30"
        width="40"
        height="60"
        rx="9"
        fill="#2b3237"
        stroke="#dfe6ea"
        strokeWidth="2"
      />
      <rect x="-12" y="-26" width="24" height="10" rx="3" fill="#7fda59" />
    </g>
  );
}

/** Top-down rover: body and four wheels; front wheels turn with `steer` (degrees). */
function RoverFigure({ steer = 0 }: { steer?: number }) {
  return (
    <g>
      {[
        [-26, -24, true],
        [26, -24, true],
        [-26, 26, false],
        [26, 26, false],
      ].map(([x, y, front]) => (
        <rect
          key={`${x},${y}`}
          x={-6}
          y={-11}
          width={12}
          height={22}
          rx={4}
          fill="#15181a"
          stroke="#8b949a"
          strokeWidth="1.5"
          transform={`translate(${x} ${y}) rotate(${front ? steer : 0})`}
        />
      ))}
      <rect
        x="-19"
        y="-36"
        width="38"
        height="72"
        rx="8"
        fill="#2b3237"
        stroke="#dfe6ea"
        strokeWidth="2"
      />
      <rect x="-12" y="-32" width="24" height="9" rx="3" fill="#7fda59" />
      <circle cx="-9" cy="10" r="8" fill="none" stroke="#c9d1d6" strokeWidth="1.5" />
      <circle cx="9" cy="10" r="8" fill="none" stroke="#c9d1d6" strokeWidth="1.5" />
    </g>
  );
}

/** The animated demo stage: the vehicle performs the current step. */
function Stage({ motion, t, drone }: { motion: Motion; t: number; drone: boolean }) {
  // Two halves per step (first key, then second); `s` rises and falls within each half.
  const half = t < 0.5 ? 0 : 1;
  const s = Math.sin(Math.PI * ((t % 0.5) / 0.5));
  const dir = half === 0 ? 1 : -1;
  let transform = '';
  let shadow = { dx: 10, dy: 14, scale: 1 };
  let figure: ReactNode = drone ? <DroneFigure /> : <RoverFigure />;
  let rings = false;
  switch (motion) {
    case 'altitude': {
      const scale = 1 + dir * 0.28 * s;
      transform = `scale(${scale})`;
      shadow = { dx: 10 + dir * 12 * s, dy: 14 + dir * 16 * s, scale: 1 - dir * 0.15 * s };
      break;
    }
    case 'rotate':
      transform = `rotate(${-dir * 55 * s})`;
      break;
    case 'fly':
      transform = `translate(0 ${-dir * 42 * s}) rotate(0)`;
      break;
    case 'slide':
      transform = `translate(${-dir * 55 * s} 0)`;
      break;
    case 'scan':
      rings = true;
      break;
    case 'land': {
      const k = Math.min(1, t * 1.6);
      transform = `scale(${1 - 0.22 * k})`;
      shadow = { dx: 10 - 8 * k, dy: 14 - 10 * k, scale: 1 };
      figure = k < 0.85 ? <DroneFigure /> : <RoverFigure />;
      break;
    }
    case 'drive':
      transform = `translate(0 ${-dir * 45 * s})`;
      break;
    case 'steer':
      transform = `rotate(${-dir * 30 * s})`;
      figure = <RoverFigure steer={-dir * 28 * s} />;
      break;
    case 'brake': {
      const k = Math.min(1, t * 2);
      transform = `translate(0 ${-50 + 50 * (1 - Math.pow(1 - k, 3)) + (k >= 1 ? 0 : 0)})`;
      break;
    }
    case 'takeoff': {
      const k = Math.min(1, t * 1.6);
      figure = k < 0.15 ? <RoverFigure /> : <DroneFigure />;
      transform = `scale(${0.8 + 0.3 * k})`;
      shadow = { dx: 2 + 10 * k, dy: 4 + 12 * k, scale: 1 };
      break;
    }
  }
  const pulse = (t * 2) % 1;
  return (
    <svg viewBox="-150 -110 300 220" className="h-full w-full">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="rgb(255 255 255 / 0.06)" />
        </pattern>
      </defs>
      <rect x="-150" y="-110" width="300" height="220" fill="url(#grid)" />
      {rings &&
        [0, 0.33, 0.66].map((offset) => {
          const p = (pulse + offset) % 1;
          return (
            <circle
              key={offset}
              r={20 + p * 110}
              fill="none"
              stroke="#7fda59"
              strokeWidth="2"
              opacity={1 - p}
            />
          );
        })}
      <g transform={transform} style={{ transformOrigin: '0 0' }}>
        <ellipse
          cx={shadow.dx}
          cy={shadow.dy}
          rx={50 * shadow.scale}
          ry={50 * shadow.scale}
          fill="rgb(0 0 0 / 0.35)"
        />
        {figure}
      </g>
    </svg>
  );
}

/**
 * Pre-mission controls demo on frosted glass. The world is paused while it is open; each control
 * is demonstrated in turn (keys light up as if pressed while the vehicle performs the move).
 */
export function ControlsIntro() {
  const manager = useGameManager();
  const bindings = useSettingsStore((s) => s.settings.keyBindings);
  const [tab, setTab] = useState<'drone' | 'rover' | 'gauges'>('drone');
  const [clock, setClock] = useState(0);
  const steps = tab === 'rover' ? ROVER : DRONE;

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // rAF timestamps can precede `start` by a frame; never let the clock go negative.
      setClock(Math.max(0, now - start));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Enter') {
        event.preventDefault();
        manager.finishControlsIntro();
      }
      if (event.code === 'Tab') {
        event.preventDefault();
        setTab((t) => (t === 'drone' ? 'rover' : t === 'rover' ? 'gauges' : 'drone'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manager]);

  const index = Math.max(0, Math.floor(clock / STEP_MS)) % steps.length;
  const t = (clock % STEP_MS) / STEP_MS;
  const step = steps[index]!;
  const keyOf = (action: GameAction) => bindings[action]?.[0] ?? '';

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 font-sans text-[#f3efe7]">
      <div className="glass w-[min(62rem,92vw)] animate-rise-in p-7">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="font-display text-[0.75rem] tracking-[0.14em] text-brand uppercase">
              Before you deploy
            </div>
            <h2 className="mt-1 font-display text-[1.9rem] tracking-[0.03em] uppercase">
              TerraWing controls
            </h2>
          </div>
          <div className="glass flex rounded-full p-1" role="tablist">
            {(['drone', 'rover', 'gauges'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-full px-5 py-1.5 font-display text-[0.75rem] tracking-[0.08em] uppercase transition-colors ${
                  tab === id ? 'bg-brand text-[#0b1206]' : 'text-[#f3efe7]/70 hover:text-[#f3efe7]'
                }`}
              >
                {id === 'drone' ? 'Drone' : id === 'rover' ? 'Rover' : 'Instruments'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'gauges' ? (
          <InstrumentGuide />
        ) : (
          <div className="mt-6 grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-6">
            <div className="glass relative aspect-[3/2] overflow-hidden">
              <Stage motion={step.motion} t={t} drone={tab === 'drone'} />
              <div className="absolute bottom-3 left-4 flex items-center gap-2 text-[0.8rem]">
                <span className="text-brand">{step.icon}</span>
                <span className="font-display tracking-[0.06em] uppercase">{step.label}</span>
                <span className="text-[#f3efe7]/55">— {step.detail}</span>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5">
              {steps.map((entry, i) => {
                const active = i === index;
                return (
                  <li
                    key={entry.label}
                    className={`flex items-center gap-4 px-3 py-2 transition-colors ${
                      active ? 'bg-white/10' : ''
                    }`}
                  >
                    <div className="flex w-[5.5rem] shrink-0 gap-1">
                      {entry.actions.map((action, k) => (
                        <Keycap
                          key={action}
                          code={keyOf(action)}
                          pressed={
                            active && (entry.actions.length === 1 ? t < 0.6 : t < 0.5 === (k === 0))
                          }
                        />
                      ))}
                    </div>
                    <span className={active ? 'text-brand' : 'text-[#f3efe7]/60'}>
                      {entry.icon}
                    </span>
                    <div className="leading-tight">
                      <div className="text-[0.95rem] font-medium">{entry.label}</div>
                      <div className="text-[0.75rem] text-[#f3efe7]/55">{entry.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-6 text-[0.8rem] text-[#f3efe7]/55">
          <span className="flex items-center gap-2">
            Controls are also in the pause menu <Keycap code="Escape" />
          </span>
          <button
            type="button"
            autoFocus
            onClick={() => manager.finishControlsIntro()}
            className="h-11 rounded-full bg-brand px-6 font-display text-[0.85rem] tracking-[0.08em] text-[#0b1206] uppercase shadow-[0_8px_30px_rgb(127_218_89/0.35)] transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:outline-none"
          >
            Start mission
          </button>
        </div>
      </div>
    </div>
  );
}
