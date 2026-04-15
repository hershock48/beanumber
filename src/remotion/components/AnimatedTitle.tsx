import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

interface AnimatedTitleProps {
  title: string;
  subtitle?: string;
  tagline?: string;
}

export const AnimatedTitle: React.FC<AnimatedTitleProps> = ({
  title,
  subtitle,
  tagline,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation
  const titleScale = spring({
    frame,
    fps,
    config: {
      damping: 15,
      stiffness: 80,
      mass: 0.8,
    },
  });

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Subtitle animation (delayed)
  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const subtitleY = interpolate(frame, [20, 40], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Tagline animation (more delayed)
  const taglineOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
      }}
    >
      <div
        style={{
          fontSize: 86,
          fontWeight: 800,
          color: 'white',
          textAlign: 'center',
          transform: `scale(${titleScale})`,
          opacity: titleOpacity,
          textShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          lineHeight: 1.1,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 36,
            fontWeight: 400,
            color: 'rgba(255, 255, 255, 0.9)',
            marginTop: 24,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            textAlign: 'center',
          }}
        >
          {subtitle}
        </div>
      )}
      {tagline && (
        <div
          style={{
            fontSize: 24,
            fontWeight: 400,
            color: 'rgba(255, 255, 255, 0.6)',
            marginTop: 20,
            opacity: taglineOpacity,
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          {tagline}
        </div>
      )}
    </AbsoluteFill>
  );
};
