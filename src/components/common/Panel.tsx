import type { HTMLAttributes, ReactNode } from 'react';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  /** Optional right-aligned header content (status chip, counter). */
  aside?: ReactNode;
  tone?: 'default' | 'warning' | 'danger';
  dense?: boolean;
}

const TONE_BORDER: Record<NonNullable<PanelProps['tone']>, string> = {
  default: 'border-ops-line',
  warning: 'border-ops-amber/50',
  danger: 'border-ops-red/60',
};

/** Dark translucent panel with a thin border and corner ticks — the base HUD/menu surface. */
export function Panel({
  title,
  aside,
  tone = 'default',
  dense = false,
  className = '',
  children,
  ...rest
}: PanelProps) {
  return (
    <div
      className={`relative border ${TONE_BORDER[tone]} bg-ops-panel backdrop-blur-[6px] ${dense ? 'px-3 py-2' : 'px-4 py-3'} ${className}`}
      {...rest}
    >
      <span className="pointer-events-none absolute -top-px -left-px h-2 w-2 border-t border-l border-ops-orange/80" />
      <span className="pointer-events-none absolute -right-px -bottom-px h-2 w-2 border-r border-b border-ops-orange/80" />
      {(title || aside) && (
        <div className="mb-2 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[10px] font-semibold tracking-[0.22em] text-ops-dim uppercase">
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}
