import type { ReactNode } from 'react';

const icon = (path: ReactNode) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {path}
  </svg>
);

/** Small line icons for control actions. */
export const ICONS = {
  altitude: icon(<path d="M12 3v18M7 8l5-5 5 5M7 16l5 5 5-5" />),
  rotate: icon(<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" />),
  fly: icon(<path d="M12 4v16M6 10l6-6 6 6" />),
  slide: icon(<path d="M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5" />),
  camera: icon(
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>,
  ),
  scan: icon(
    <>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="6" opacity="0.7" />
      <circle cx="12" cy="12" r="10" opacity="0.4" />
    </>,
  ),
  transform: icon(<path d="M4 8h13l-3-3M20 16H7l3 3" />),
  drive: icon(
    <>
      <path d="M4 15l2-6h12l2 6v3H4z" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="16" cy="18" r="1.6" />
    </>,
  ),
  steer: icon(
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M4.5 10h5M14.5 10h5M12 14v6" />
    </>,
  ),
  brake: icon(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" />
    </>,
  ),
  mouse: icon(
    <>
      <rect x="7" y="3" width="10" height="18" rx="5" />
      <path d="M12 7v4" />
    </>,
  ),
  pause: icon(<path d="M9 5v14M15 5v14" />),
};
