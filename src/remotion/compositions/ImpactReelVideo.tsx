/**
 * Instagram/TikTok Reel - 2026 Best Practices
 *
 * Based on research:
 * - Hook in first 1-3 seconds (63% of high-CTR videos hook in 3s)
 * - 65%+ 3-second retention = 4-7x more impressions
 * - 85% watch muted - strong text overlays essential
 * - Pattern interrupts every 2-3 seconds
 * - Emotional storytelling > statistics
 * - Dignity-based, not pity-based
 * - 15-30 seconds optimal length
 */

import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
  Easing,
} from 'remotion';

interface ReelStats {
  womenTrained: number;
  menTrained: number;
  localEmployed: number;
  medicalServiced: number;
  youthEngaged: number;
  childrenSponsored: number;
  schoolCompletion: number;
}

interface ImpactReelVideoProps {
  stats: ReelStats;
}

// ============================================================================
// ANIMATED BACKGROUND
// ============================================================================
const AnimatedBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();

  // Dynamic gradient that shifts
  const hue1 = interpolate(frame, [0, 600], [200, 260]);
  const hue2 = interpolate(frame, [0, 600], [240, 300]);

  // Subtle zoom pulse on background
  const bgScale = interpolate(
    frame,
    [0, 300, 600],
    [1, 1.05, 1.1],
    { extrapolateRight: 'clamp' }
  );

  // Floating particles for depth
  const particles = Array.from({ length: 30 }, (_, i) => {
    const speed = 1 + (i % 3) * 0.5;
    const startY = 2200 + (i * 80);
    const y = startY - (frame * speed * 3);
    const x = 50 + ((i * 73) % 980);
    const size = 3 + (i % 4) * 2;
    const opacity = 0.05 + (i % 6) * 0.03;

    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: y % 2200,
          width: size,
          height: size,
          borderRadius: '50%',
          background: `rgba(255, 255, 255, ${opacity})`,
          filter: 'blur(1px)',
        }}
      />
    );
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(165deg,
          hsl(${hue1}, 65%, 12%) 0%,
          hsl(${hue2}, 55%, 18%) 40%,
          hsl(${hue1 + 30}, 60%, 15%) 100%)`,
        overflow: 'hidden',
      }}
    >
      <div style={{ transform: `scale(${bgScale})`, width: '100%', height: '100%' }}>
        {particles}
      </div>
      {children}
    </AbsoluteFill>
  );
};

// ============================================================================
// HOOK SCREEN - First 3 seconds are CRITICAL
// Pattern interrupt + Curiosity gap
// ============================================================================
const HookScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slam in effect - starts big, slams to size
  const slamScale = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 300, mass: 0.3 },
    from: 2.5,
    to: 1,
  });

  // Shake on impact
  const shakeX = frame < 8 ? Math.sin(frame * 4) * (8 - frame) * 1.5 : 0;
  const shakeY = frame < 8 ? Math.cos(frame * 3) * (8 - frame) : 0;

  // Flash effect
  const flashOpacity = interpolate(frame, [0, 3, 8], [0.8, 0.4, 0], {
    extrapolateRight: 'clamp',
  });

  // Text reveal
  const line1Opacity = interpolate(frame, [0, 5], [0, 1], { extrapolateRight: 'clamp' });
  const line2Opacity = interpolate(frame, [15, 22], [0, 1], { extrapolateRight: 'clamp' });
  const line2Y = interpolate(frame, [15, 25], [30, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      {/* Flash overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'white',
          opacity: flashOpacity,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          transform: `scale(${slamScale}) translate(${shakeX}px, ${shakeY}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 50px',
        }}
      >
        {/* Main hook text */}
        <div
          style={{
            fontSize: 82,
            fontWeight: 900,
            color: 'white',
            textAlign: 'center',
            lineHeight: 1.1,
            opacity: line1Opacity,
            textShadow: '0 4px 30px rgba(0,0,0,0.5)',
          }}
        >
          THIS TOOK
        </div>
        <div
          style={{
            fontSize: 140,
            fontWeight: 900,
            color: '#FFD93D',
            textAlign: 'center',
            lineHeight: 1,
            opacity: line1Opacity,
            textShadow: '0 0 60px rgba(255,217,61,0.5)',
          }}
        >
          15 YEARS
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)',
            marginTop: 20,
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
            textAlign: 'center',
          }}
        >
          ...but look what happened 👇
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// STAT SLAM - Big number with context
// ============================================================================
const StatSlam: React.FC<{
  number: string;
  context: string;
  emoji: string;
  color: string;
  subtext?: string;
}> = ({ number, context, emoji, color, subtext }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Number slams in
  const numberScale = spring({
    frame,
    fps,
    config: { damping: 7, stiffness: 250, mass: 0.4 },
    from: 0,
    to: 1,
  });

  // Bounce effect
  const bounce = interpolate(
    frame,
    [8, 12, 16, 20],
    [1, 1.08, 0.98, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Context slides in
  const contextY = spring({
    frame: frame - 8,
    fps,
    config: { damping: 12, stiffness: 100 },
    from: 40,
    to: 0,
  });

  const contextOpacity = interpolate(frame, [8, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Glow pulse
  const glowIntensity = interpolate(
    frame,
    [0, 15, 30, 45],
    [0, 80, 50, 60],
    { extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Emoji */}
        <div
          style={{
            fontSize: 90,
            marginBottom: 15,
            transform: `scale(${numberScale})`,
          }}
        >
          {emoji}
        </div>

        {/* Big Number */}
        <div
          style={{
            fontSize: 180,
            fontWeight: 900,
            color,
            lineHeight: 1,
            transform: `scale(${numberScale * bounce})`,
            textShadow: `0 0 ${glowIntensity}px ${color}`,
          }}
        >
          {number}
        </div>

        {/* Context */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            marginTop: 15,
            opacity: contextOpacity,
            transform: `translateY(${contextY}px)`,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          {context}
        </div>

        {/* Subtext */}
        {subtext && (
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
              marginTop: 12,
              opacity: contextOpacity,
            }}
          >
            {subtext}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// TRANSFORMATION REVEAL
// ============================================================================
const TransformationReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  // Staggered reveals
  const items = [
    { icon: '🏥', text: 'Medical Center', delay: 0, color: '#4ECDC4' },
    { icon: '🏫', text: 'School (95% done!)', delay: 10, color: '#FFD93D' },
    { icon: '🏠', text: '3 Dormitories', delay: 20, color: '#FF6B9D' },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 50px' }}>
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          color: 'white',
          textAlign: 'center',
          marginBottom: 50,
          transform: `scale(${scale})`,
        }}
      >
        WE BUILT THIS 🔨
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 25, width: '100%' }}>
        {items.map(({ icon, text, delay, color }) => {
          const itemScale = spring({
            frame: frame - delay,
            fps,
            config: { damping: 10, stiffness: 150 },
          });
          const itemOpacity = interpolate(frame - delay, [0, 10], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 20,
                padding: '20px 30px',
                transform: `scale(${itemScale})`,
                opacity: itemOpacity,
                borderLeft: `6px solid ${color}`,
              }}
            >
              <span style={{ fontSize: 50 }}>{icon}</span>
              <span style={{ fontSize: 36, fontWeight: 700, color: 'white' }}>{text}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// EMOTIONAL CLOSE - Human-centered, not stat-centered
// ============================================================================
const EmotionalClose: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const line2Delay = 20;
  const line2Opacity = interpolate(frame, [line2Delay, line2Delay + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Pulsing glow on CTA
  const ctaGlow = interpolate(
    frame,
    [40, 55, 70, 85],
    [30, 50, 30, 50],
    { extrapolateRight: 'extend' }
  );

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 50px' }}>
      <div
        style={{
          transform: `scale(${scale})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: 'white',
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          From war zone
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: '#4ECDC4',
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          to opportunity.
        </div>

        <div
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 30,
            textAlign: 'center',
            opacity: line2Opacity,
          }}
        >
          This is what 15 years of<br />relationship-based work looks like.
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: 50,
            padding: '18px 40px',
            background: '#FFD93D',
            borderRadius: 50,
            fontSize: 32,
            fontWeight: 800,
            color: '#1a1a2e',
            boxShadow: `0 0 ${ctaGlow}px rgba(255,217,61,0.6)`,
            opacity: line2Opacity,
          }}
        >
          beanumber.org
        </div>

        <div
          style={{
            marginTop: 20,
            fontSize: 26,
            color: 'white',
            opacity: line2Opacity,
          }}
        >
          Link in bio 👆
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// MAIN COMPOSITION
// ============================================================================
export const ImpactReelVideo: React.FC<ImpactReelVideoProps> = ({ stats }) => {
  return (
    <AnimatedBackground>
      {/*
        ADD YOUR MUSIC:
        1. Put MP3/WAV in public/ folder (e.g., public/music.mp3)
        2. Uncomment line below
        3. Use trending sounds from TikTok for best reach
      */}
      {/* <Audio src={staticFile('music.mp3')} volume={0.7} /> */}

      {/* HOOK - 0-3 seconds (frames 0-90) - MOST IMPORTANT */}
      <Sequence from={0} durationInFrames={75}>
        <HookScreen />
      </Sequence>

      {/* STAT 1: Women empowered - emotional framing */}
      <Sequence from={75} durationInFrames={55}>
        <StatSlam
          number="60"
          context="Women Empowered"
          emoji="👩‍🎓"
          color="#FF6B9D"
          subtext="With real job skills"
        />
      </Sequence>

      {/* STAT 2: Healthcare - human impact */}
      <Sequence from={130} durationInFrames={55}>
        <StatSlam
          number="700+"
          context="Lives Touched"
          emoji="💊"
          color="#4ECDC4"
          subtext="Through healthcare access"
        />
      </Sequence>

      {/* STAT 3: Jobs - dignity focused */}
      <Sequence from={185} durationInFrames={55}>
        <StatSlam
          number="30"
          context="Families Supported"
          emoji="💼"
          color="#FFD93D"
          subtext="Through stable employment"
        />
      </Sequence>

      {/* TRANSFORMATION - What we built */}
      <Sequence from={240} durationInFrames={80}>
        <TransformationReveal />
      </Sequence>

      {/* EMOTIONAL CLOSE + CTA */}
      <Sequence from={320} durationInFrames={130}>
        <EmotionalClose />
      </Sequence>

      {/* Social handle watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 100,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 22,
          fontWeight: 500,
        }}
      >
        @beanumber
      </div>
    </AnimatedBackground>
  );
};
