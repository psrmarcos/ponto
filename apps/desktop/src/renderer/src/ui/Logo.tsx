export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo" aria-hidden="true" style={{ width: size, height: size }}>
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="none">
        <path
          d="M8 19.5V5.5h5.5a5 5 0 0 1 0 10H8"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="13.3" cy="10.5" r="1.7" fill="currentColor" />
      </svg>
    </span>
  );
}
