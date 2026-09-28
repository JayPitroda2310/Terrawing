import { formatKeyCode } from '@/game/input/actions';

const ARROWS: Record<string, number> = {
  ArrowUp: 0,
  ArrowRight: 90,
  ArrowDown: 180,
  ArrowLeft: 270,
  Numpad8: 0,
  Numpad6: 90,
  Numpad2: 180,
  Numpad4: 270,
};

/** A glass keycap; arrow keys show an arrow glyph. `pressed` shows it held down and lit. */
export function Keycap({ code, pressed = false }: { code: string; pressed?: boolean }) {
  const rotation = ARROWS[code];
  return (
    <kbd
      className={`keycap transition-all duration-150 ${code === 'Space' ? 'min-w-[4.6rem]' : ''} ${
        pressed
          ? 'translate-y-[2px] !border-b-[1px] !border-brand/70 text-brand shadow-[0_0_18px_rgb(127_218_89/0.55)]'
          : ''
      }`}
    >
      {rotation !== undefined ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-label={formatKeyCode(code)}
        >
          <path d="M6 1.5 L10.5 7 H7.4 V10.5 H4.6 V7 H1.5 Z" fill="currentColor" />
        </svg>
      ) : (
        formatKeyCode(code)
      )}
    </kbd>
  );
}
