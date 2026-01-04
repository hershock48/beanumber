export function Logo({ variant = 'primary', className = '' }: { variant?: 'primary' | 'micro'; className?: string }) {
  if (variant === 'micro') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        fill="none"
        className={className}
      >
        <line x1="33.33" y1="0" x2="33.33" y2="100" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1="66.67" y1="0" x2="66.67" y2="100" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="33.33" x2="100" y2="33.33" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="66.67" x2="100" y2="66.67" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      className={className}
    >
      <line x1="33.33" y1="0" x2="33.33" y2="100" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1="66.67" y1="0" x2="66.67" y2="100" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="33.33" x2="100" y2="33.33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="66.67" x2="100" y2="66.67" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <text
        x="16.67"
        y="16.67"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="11"
        fill="currentColor"
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight="400"
      >
        be.
      </text>
    </svg>
  );
}
