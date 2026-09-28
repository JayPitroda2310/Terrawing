import type { HTMLAttributes, ReactNode } from 'react';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  /** Optional right-aligned header content (status chip, counter). */
  aside?: ReactNode;
  tone?: 'default' | 'warning' | 'danger';
  dense?: boolean;
}

/** Cockpit-style bezel panel (chamfered corners, lit top edge) — the base HUD/menu surface. */
export function Panel({
  title,
  aside,
  tone = 'default',
  dense = false,
  className = '',
  children,
  ...rest
}: PanelProps) {
  const accent =
    tone === 'danger' ? 'bg-ops-red' : tone === 'warning' ? 'bg-ops-amber' : 'bg-ops-orange';
  return (
    <div
      className={`bezel ${dense ? 'px-3.5 pt-3 pb-2.5' : 'px-4 pt-3.5 pb-3'} ${className}`}
      {...rest}
    >
      {/* Lit top edge: a short accent segment after the chamfer, then a hairline. */}
      <span className={`pointer-events-none absolute top-0 left-[12px] h-[2px] w-10 ${accent}`} />
      <span className="pointer-events-none absolute top-0 right-0 left-[52px] h-px bg-white/10" />
      {/* Tick marks along the bottom edge, like an instrument scale. */}
      <span className="pointer-events-none absolute right-[14px] bottom-[5px] flex gap-[3px] opacity-40">
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className="h-[5px] w-px bg-white" />
        ))}
      </span>
      {(title || aside) && (
        <div className="mb-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06] pb-1.5">
          {title && (
            <h2 className="flex items-center gap-2 font-display text-[10px] tracking-[0.2em] text-ops-dim uppercase">
              <span className={`h-1.5 w-1.5 rotate-45 ${accent}`} />
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
