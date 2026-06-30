'use client';

/**
 * Visual-only progress ring with a centered gold circle and a label.
 *
 * State (progress, holding) is owned by the parent so the touch zone
 * can be anywhere on screen — not just the visible button. This
 * component renders only what the user SEES:
 *   - Background "track" ring (faint gold)
 *   - Filling progress ring (solid gold) that grows clockwise
 *   - Centered gold button-style circle with the label
 *
 * The parent wires the actual touch handlers and tells us how full
 * the ring should be via `progress` (0..1) + whether to suppress the
 * stroke transition via `holding`.
 */
export function HoldButton({
  progress,
  holding,
  label,
  size = 180,
}: {
  progress: number; // 0..1
  holding: boolean;
  label: string;
  size?: number;
}) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className="relative inline-block pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        className="absolute inset-0"
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(212, 168, 67, 0.18)"
          strokeWidth={stroke}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#D4A843"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: holding ? 'none' : 'stroke-dashoffset 250ms ease-out',
          }}
        />
      </svg>
      <div
        className="absolute inset-2 rounded-full bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm md:text-base flex items-center justify-center select-none"
        style={{
          transform: holding ? 'scale(0.97)' : 'scale(1)',
          transition: 'transform 120ms ease-out, background-color 200ms ease-out',
        }}
      >
        {label}
      </div>
    </div>
  );
}
