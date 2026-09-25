import { useEffect, useState, type ReactNode } from 'react';
import { useGameManager } from '@/app/GameManagerContext';
import { Button } from '@/components/common/Button';
import { Panel } from '@/components/common/Panel';
import { ScreenFrame } from '@/components/common/ScreenFrame';
import {
  ACTION_LABELS,
  DEFAULT_KEY_BINDINGS,
  formatKeyCode,
  REBINDABLE_ACTIONS,
  type GameAction,
} from '@/game/input/actions';
import type { GraphicsQuality } from '@/services/save/saveSchema';
import { useSettingsStore } from '@/store/settingsStore';

type Tab = 'graphics' | 'audio' | 'controls' | 'gameplay';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'controls', label: 'Controls' },
  { id: 'gameplay', label: 'Gameplay' },
];

export function SettingsMenu() {
  const manager = useGameManager();
  const [tab, setTab] = useState<Tab>('graphics');

  return (
    <ScreenFrame dim="full">
      <div className="flex h-full items-center justify-center p-10">
        <Panel className="flex h-[min(640px,90vh)] w-[760px] flex-col animate-rise-in">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.35em] text-ops-orange uppercase">
                Configuration
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-[0.12em]">SETTINGS</h1>
            </div>
            <Button onClick={() => manager.closeSettings()}>Done</Button>
          </div>
          <div role="tablist" className="mb-5 flex gap-1 border-b border-ops-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-4 py-2 text-[11px] font-semibold tracking-[0.2em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-ops-cyan ${
                  tab === t.id
                    ? 'border-ops-orange text-ops-text'
                    : 'border-transparent text-ops-dim hover:text-ops-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="flex-1 overflow-y-auto pr-2">
            {tab === 'graphics' && <GraphicsTab />}
            {tab === 'audio' && <AudioTab />}
            {tab === 'controls' && <ControlsTab />}
            {tab === 'gameplay' && <GameplayTab />}
          </div>
        </Panel>
      </div>
    </ScreenFrame>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-ops-line py-3">
      <div>
        <div className="text-sm text-ops-text">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-ops-faint">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className={`w-20 border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.15em] outline-none focus-visible:ring-2 focus-visible:ring-ops-cyan ${
        value ? 'border-ops-cyan/70 text-ops-cyan' : 'border-ops-line-strong text-ops-dim'
      }`}
    >
      {value ? 'ON' : 'OFF'}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-48 accent-[#ff6a1a]"
      />
      <span className="tabular w-12 text-right font-mono text-xs text-ops-text">
        {format(value)}
      </span>
    </>
  );
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

function GraphicsTab() {
  const graphics = useSettingsStore((s) => s.settings.graphics);
  const update = useSettingsStore((s) => s.update);
  const options: { id: GraphicsQuality; label: string; hint: string }[] = [
    { id: 'low', label: 'Low', hint: 'No shadows, reduced vegetation and rain' },
    { id: 'medium', label: 'Medium', hint: 'Shadows, mist, headlights' },
    { id: 'high', label: 'High', hint: 'Full vegetation, bloom, high-res shadows' },
  ];
  return (
    <div>
      <Row label="Graphics quality" hint="Changing quality reloads the 3D view.">
        <div role="radiogroup" aria-label="Graphics quality" className="flex gap-1">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={graphics === o.id}
              title={o.hint}
              onClick={() => update('graphics', o.id)}
              className={`w-24 border px-3 py-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-ops-cyan ${
                graphics === o.id
                  ? 'border-ops-orange bg-ops-orange/15 text-ops-text'
                  : 'border-ops-line-strong text-ops-dim'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Row>
      <p className="mt-3 text-xs text-ops-faint">{options.find((o) => o.id === graphics)?.hint}</p>
    </div>
  );
}

function AudioTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  return (
    <div>
      <Row label="Master volume">
        <Slider
          label="Master volume"
          value={settings.masterVolume}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          onChange={(v) => update('masterVolume', v)}
        />
      </Row>
      <Row label="Music volume">
        <Slider
          label="Music volume"
          value={settings.musicVolume}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          onChange={(v) => update('musicVolume', v)}
        />
      </Row>
      <Row label="Effects volume" hint="Vehicle, scanner, ambience and radio.">
        <Slider
          label="Effects volume"
          value={settings.sfxVolume}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          onChange={(v) => update('sfxVolume', v)}
        />
      </Row>
      <Row label="Radio subtitles" hint="Show base radio transmissions as text.">
        <Toggle
          label="Radio subtitles"
          value={settings.showSubtitles}
          onChange={(v) => update('showSubtitles', v)}
        />
      </Row>
    </div>
  );
}

function ControlsTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const rebind = useSettingsStore((s) => s.rebind);
  const [listening, setListening] = useState<GameAction | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== 'Escape') rebind(listening, event.code);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [listening, rebind]);

  return (
    <div>
      <Row label="Mouse sensitivity">
        <Slider
          label="Mouse sensitivity"
          value={settings.mouseSensitivity}
          min={0.1}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update('mouseSensitivity', v)}
        />
      </Row>
      <Row label="Invert Y axis">
        <Toggle
          label="Invert Y axis"
          value={settings.invertY}
          onChange={(v) => update('invertY', v)}
        />
      </Row>
      <div className="mt-5 mb-2 text-[10px] font-semibold tracking-[0.25em] text-ops-dim uppercase">
        Key bindings
      </div>
      {REBINDABLE_ACTIONS.map((action) => (
        <Row key={action} label={ACTION_LABELS[action]}>
          <button
            type="button"
            onClick={() => setListening(action)}
            aria-label={`Rebind ${ACTION_LABELS[action]}`}
            className={`min-w-36 border px-3 py-1.5 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ops-cyan ${
              listening === action
                ? 'animate-pulse-soft border-ops-orange text-ops-orange'
                : 'border-ops-line-strong text-ops-text hover:border-ops-orange/60'
            }`}
          >
            {listening === action
              ? 'PRESS A KEY…'
              : settings.keyBindings[action].map(formatKeyCode).join(' / ')}
          </button>
        </Row>
      ))}
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={() => update('keyBindings', DEFAULT_KEY_BINDINGS)}>
          Reset bindings
        </Button>
      </div>
    </div>
  );
}

function GameplayTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  return (
    <div>
      <Row label="Camera shake" hint="Impacts and rough terrain.">
        <Toggle
          label="Camera shake"
          value={settings.cameraShake}
          onChange={(v) => update('cameraShake', v)}
        />
      </Row>
      <Row label="Motion effects" hint="Speed-based field of view and camera banking.">
        <Toggle
          label="Motion effects"
          value={settings.motionEffects}
          onChange={(v) => update('motionEffects', v)}
        />
      </Row>
      <Row
        label="Reduced motion"
        hint="Disables camera shake, banking, orbiting shots and UI animation."
      >
        <Toggle
          label="Reduced motion"
          value={settings.reducedMotion}
          onChange={(v) => update('reducedMotion', v)}
        />
      </Row>
    </div>
  );
}
