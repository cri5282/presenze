import { useId } from "react";

export function LogoMark({ size = 40 }: { size?: number }) {
  const gradient = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Presenze"
      className="logo-mark"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b7cff" />
          <stop offset="55%" stopColor="#6d5dfc" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      <rect
        x="13.5"
        y="19.5"
        width="37"
        height="32"
        rx="7"
        fill="none"
        stroke="white"
        strokeWidth="3.4"
      />
      <path d="M13.5 30.5h37" stroke="white" strokeWidth="3.4" />
      <path
        d="M23 14.5v8M41 14.5v8"
        stroke="white"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="m23.5 41 5 5 12-12"
        fill="none"
        stroke="white"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
