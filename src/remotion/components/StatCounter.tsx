import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface StatCounterProps {
  value: number;
  label: string;
  sublabel?: string;
  prefix?: string;
  suffix?: string;
  delay?: number;
  color?: string;
  small?: boolean;
}

export const StatCounter: React.FC<StatCounterProps> = ({
  value,
  label,
  sublabel,
  prefix = '',
  suffix = '',
  delay = 0,
  color = '#FFFFFF',
  small = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animate in with spring
  const scale = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 12,
      stiffness: 100,
      mass: 0.5,
    },
  });

  // Count up animation
  const countProgress = interpolate(
    frame - delay,
    [0, 60],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const displayValue = Math.round(value * countProgress);

  // Format number with commas
  const formattedValue = displayValue.toLocaleString();

  const opacity = interpolate(
    frame - delay,
    [0, 15],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const fontSize = small ? 48 : 72;
  const labelSize = small ? 20 : 28;
  const sublabelSize = small ? 14 : 18;
  const padding = small ? 25 : 40;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 800,
          color,
          lineHeight: 1,
          marginBottom: 12,
        }}
      >
        {prefix}{formattedValue}{suffix}
      </div>
      <div
        style={{
          fontSize: labelSize,
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.95)',
          textTransform: 'uppercase',
          letterSpacing: 2,
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      {sublabel && (
        <div
          style={{
            fontSize: sublabelSize,
            fontWeight: 400,
            color: 'rgba(255, 255, 255, 0.7)',
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
};
