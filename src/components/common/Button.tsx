import type { ButtonHTMLAttributes } from 'react';
import { useGameManager } from '@/app/GameManagerContext';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
}

const VARIANTS = {
  primary:
    'border-ops-orange bg-ops-orange/90 text-[#10100f] hover:bg-ops-orange focus-visible:ring-ops-orange',
  secondary:
    'border-ops-line-strong bg-ops-panel text-ops-text hover:border-ops-orange/70 hover:text-white focus-visible:ring-ops-cyan',
  ghost:
    'border-transparent bg-transparent text-ops-dim hover:text-ops-text focus-visible:ring-ops-cyan',
} as const;

/** Menu button with UI click audio. Keyboard focus is clearly visible. */
export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const manager = useGameManager();
  return (
    <button
      type="button"
      className={`group relative flex items-center gap-3 border font-semibold tracking-[0.18em] uppercase transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-ops-bg disabled:cursor-not-allowed disabled:opacity-40 ${
        size === 'lg' ? 'px-6 py-3.5 text-sm' : 'px-4 py-2.5 text-xs'
      } ${VARIANTS[variant]} ${className}`}
      onMouseEnter={() => manager.audio.play('uiClick', { volume: 0.4 })}
      onClick={(event) => {
        manager.audio.play('uiConfirm');
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
