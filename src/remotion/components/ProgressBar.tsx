import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface ProgressBarProps {
  label: string;
  sublabel?: string;
  percent: number;
  delay?: number;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  label,
  sublabel,
  percent,
  delay = 0,
  color = '#48BB78',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Container fade in
  const containerOpacity = interpolate(
    frame - delay,
    [0, 20],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  // Progress animation
  const progressWidth = interpolate(
    frame - delay,
    [20, 80],
    [0, percent],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  // Number count up
  const displayPercent = Math.round(progressWidth);

  // Scale animation
  const scale = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 15,
      stiffness: 80,
      mass: 0.6,
    },
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        opacity: containerOpacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'white',
            }}
          >
            {label}
          </span>
          {sublabel && (
            <span
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: 'rgba(255, 255, 255, 0.7)',
                marginLeft: 16,
              }}
            >
              {sublabel}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color,
          }}
        >
          {displayPercent}%
        </div>
      </div>
      <div
        style={{
          width: '100%',
          height: 24,
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progressWidth}%`,
            height: '100%',
            background: color,
            borderRadius: 12,
            boxShadow: `0 0 20px ${color}66`,
          }}
        />
      </div>
    </div>
  );
};
