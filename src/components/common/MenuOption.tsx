import type { ReactNode } from 'react';

/**
 * Menu entry. Selected (hover / keyboard focus), a chamfered plate slides in behind the label with
 * a lit edge on the left and a chevron, and the label steps forward — no loose line in front.
 */
export function MenuOption({
  children,
  detail,
  onClick,
  autoFocus,
  danger = false,
}: {
  children: ReactNode;
  detail?: string;
  onClick: () => void;
  autoFocus?: boolean;
  danger?: boolean;
}) {
  const accent = danger ? 'bg-ops-red' : 'bg-brand';
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      // Hovering selects the item (moves focus), so exactly one option is ever highlighted.
      onMouseEnter={(event) => event.currentTarget.focus()}
      data-menu-option
      onKeyDown={(event) => {
        // Up / Down arrows move the selection through the menu (wrapping around).
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const menu = event.currentTarget.closest('nav') ?? event.currentTarget.parentElement;
        if (!menu) return;
        const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('[data-menu-option]'));
        const index = options.indexOf(event.currentTarget);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        options[(index + step + options.length) % options.length]?.focus();
      }}
      className="group relative flex w-[21rem] items-center py-2 pr-6 pl-5 text-left outline-none"
    >
      {/* Selection plate */}
      <span
        aria-hidden
        className="absolute inset-0 origin-left scale-x-0 bg-gradient-to-r from-white/[0.1] via-white/[0.04] to-transparent opacity-0 transition-[transform,opacity] duration-300 ease-out [clip-path:polygon(0_0,100%_0,calc(100%-10px)_100%,0_100%)] group-focus:scale-x-100 group-focus:opacity-100"
      />
      <span
        aria-hidden
        className={`absolute top-0 bottom-0 left-0 w-[3px] origin-center scale-y-0 transition-transform duration-300 group-focus:scale-y-100 ${accent}`}
      />
      <span
        aria-hidden
        className={`relative mr-3 text-[0.8rem] opacity-0 transition-[opacity,transform] duration-300 -translate-x-2 group-focus:translate-x-0 group-focus:opacity-100 ${
          danger ? 'text-ops-red' : 'text-brand'
        }`}
      >
        ▸
      </span>
      <span className="relative flex flex-col transition-transform duration-300 group-focus:translate-x-1">
        <span
          className={`font-display text-[1.3rem] leading-tight tracking-[0.05em] uppercase transition-colors duration-200 ${
            danger
              ? 'text-[#f3efe7]/40 group-focus:text-ops-red'
              : 'text-[#f3efe7]/55 group-focus:text-[#f3efe7]'
          }`}
        >
          {children}
        </span>
        {detail && (
          <span className="mt-0.5 font-sans text-[0.8rem] text-[#f3efe7]/40 transition-colors group-focus:text-[#f3efe7]/65">
            {detail}
          </span>
        )}
      </span>
    </button>
  );
}
