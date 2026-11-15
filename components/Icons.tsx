// Small line icons (24×24, stroke = currentColor) for navigation and round buttons.
const paths: Record<string, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  dining: <path d="M7 3v8m-2.5-8v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v3h3" />,
  cart: (
    <>
      <path d="M3 4h2.5l2.2 11h10.6L20.5 7H7" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  pantry: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M5 11h14M9 7v1.5M9 14.5V16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flame: <path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.2 2.2-4.7 3.4-7.4.6 1.6 1.6 2.4 2.6 2.4 0-2.6 1-5 3-7.4.4 3 4 5.6 4 10.4 0 4.6-3 7.6-7 7.6z" />,
  dumbbell: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  grain: <path d="M12 21V8m0 4c-2.5 0-4-1.6-4-4 2.5 0 4 1.6 4 4zm0 0c2.5 0 4-1.6 4-4-2.5 0-4 1.6-4 4zm0 5c-2.5 0-4-1.6-4-4 2.5 0 4 1.6 4 4zm0 0c2.5 0 4-1.6 4-4-2.5 0-4 1.6-4 4zM12 8c-1.2-1-1.8-2.2-1.8-3.6C11 3.4 11.6 3 12 3s1 .4 1.8 1.4C13.8 5.8 13.2 7 12 8z" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8m0 8v1.5" />
    </>
  ),
  leaf: <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19c3-4 6-6 9-7" />,
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z" />
      <circle cx="16" cy="13.5" r="1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export type IconName = keyof typeof paths;

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}
