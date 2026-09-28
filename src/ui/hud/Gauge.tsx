const SWEEP = 240;
const START = -120;

interface Zone {
  from: number;
  to: number;
  tone: 'caution' | 'danger' | 'good';
}

interface GaugeProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  /** Scale numbering interval, and minor ticks per major interval. */
  major: number;
  minor?: number;
  zones?: Zone[];
  /** Digits after the decimal point in the centre readout. */
  decimals?: number;
  size?: number;
  /** Optional short status under the value (e.g. WHEELSPIN); highlighted when set. */
  status?: string | null;
}

const ZONE_COLOR: Record<Zone['tone'], string> = {
  caution: 'var(--color-ops-amber)',
  danger: 'var(--color-ops-red)',
  good: 'var(--color-ops-green)',
};

function polar(angleDeg: number, radius: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

function arc(fromDeg: number, toDeg: number, radius: number): string {
  const [x1, y1] = polar(fromDeg, radius);
  const [x2, y2] = polar(toDeg, radius);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * Round instrument dial in the style of performance-car and cockpit gauges: 240° scale with major
 * and minor ticks, numbered, coloured caution/danger bands, a sweeping needle and a digital
 * readout in the centre.
 */
export function Gauge({
  label,
  unit,
  value,
  min,
  max,
  major,
  minor = 4,
  zones = [],
  decimals = 0,
  size = 118,
  status = null,
}: GaugeProps) {
  const toAngle = (v: number) =>
    START + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * SWEEP;
  const r = 50;
  const ticks = [];
  const step = major / minor;
  for (let v = min, k = 0; v <= max + 1e-6; v += step, k++) {
    const isMajor = k % minor === 0;
    const a = toAngle(v);
    const [x1, y1] = polar(a, r - 1);
    const [x2, y2] = polar(a, r - (isMajor ? 9 : 5));
    ticks.push(
      <line
        key={`t${k}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={isMajor ? 1.6 : 0.8}
        opacity={isMajor ? 0.9 : 0.5}
      />,
    );
    if (isMajor) {
      const [tx, ty] = polar(a, r - 17);
      ticks.push(
        <text
          key={`n${k}`}
          x={tx}
          y={ty + 3}
          textAnchor="middle"
          className="fill-current font-mono"
          fontSize={8}
          opacity={0.75}
        >
          {Math.round(v)}
        </text>,
      );
    }
  }
  const angle = toAngle(value);
  const alert = zones.find((z) => value >= z.from && value <= z.to && z.tone !== 'good');

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="-60 -60 120 120" width={size} height={size} className="text-ops-text">
        {/* Bezel */}
        <circle
          r={58}
          fill="rgb(0 0 0 / 0.35)"
          stroke="var(--color-ops-line-strong)"
          strokeWidth={1}
        />
        <path
          d={arc(START, START + SWEEP, r)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.35}
        />
        {zones.map((z) => (
          <path
            key={`${z.from}-${z.to}`}
            d={arc(toAngle(z.from), toAngle(z.to), r - 2.5)}
            fill="none"
            stroke={ZONE_COLOR[z.tone]}
            strokeWidth={4}
            opacity={0.85}
          />
        ))}
        {ticks}
        {/* Needle: sweeps smoothly between telemetry updates. */}
        <g style={{ transform: `rotate(${angle}deg)`, transition: 'transform 140ms linear' }}>
          <path d="M -1.8 6 L 0 -44 L 1.8 6 Z" fill="var(--color-ops-orange)" />
        </g>
        <circle r={4.5} fill="#15191c" stroke="currentColor" strokeWidth={1} />
        <text
          y={24}
          textAnchor="middle"
          className="fill-current font-mono"
          fontSize={15}
          fontWeight={700}
        >
          {value.toFixed(decimals)}
        </text>
        <text
          y={34}
          textAnchor="middle"
          className="fill-current font-mono"
          fontSize={7}
          opacity={0.6}
        >
          {unit}
        </text>
      </svg>
      <div className="mt-0.5 text-[9px] font-semibold tracking-[0.22em] text-ops-faint uppercase">
        {label}
      </div>
      <div
        className={`h-3 font-mono text-[9px] font-semibold tracking-[0.12em] ${
          alert || status ? 'animate-pulse-soft text-ops-amber' : 'text-transparent'
        }`}
      >
        {status ?? (alert ? (alert.tone === 'danger' ? 'LIMIT' : 'CAUTION') : '·')}
      </div>
    </div>
  );
}
