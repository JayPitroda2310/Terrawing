import type { ReactNode } from 'react';

/** Full-screen overlay used by menus, with a readable gradient over the 3D backdrop. */
export function ScreenFrame({
  children,
  dim = 'left',
  className = '',
}: {
  children: ReactNode;
  dim?: 'left' | 'full';
  className?: string;
}) {
  const gradient =
    dim === 'left'
      ? 'bg-[linear-gradient(90deg,rgb(7_10_12/0.92)_0%,rgb(7_10_12/0.75)_38%,rgb(7_10_12/0.05)_75%)]'
      : 'bg-[rgb(7_10_12/0.78)]';
  return (
    <div
      className={`absolute inset-0 z-20 animate-fade-in overflow-y-auto ${gradient} ${className}`}
    >
      {children}
    </div>
  );
}
