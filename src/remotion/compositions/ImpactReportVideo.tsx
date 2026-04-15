import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Sequence,
} from 'remotion';
import { StatCounter } from '../components/StatCounter';
import { AnimatedTitle } from '../components/AnimatedTitle';
import { ProgressBar } from '../components/ProgressBar';

export interface ImpactStats {
  womenTrained: number;
  menTrained: number;
  localEmployed: number;
  medicalServiced: number;
  youthEngaged: number;
  childrenSponsored: number;
  schoolCapacity: number;
  schoolCompletion: number;
  dormitoriesBuilt: number;
  universityCohortsConfirmed: number;
  patientGoal2026: number;
}

interface ImpactReportVideoProps {
  year: number;
  stats: ImpactStats;
}

export const ImpactReportVideo: React.FC<ImpactReportVideoProps> = ({ year, stats }) => {
  const frame = useCurrentFrame();

  // Background gradient animation
  const gradientProgress = interpolate(frame, [0, 900], [0, 180]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientProgress}deg, #1a365d 0%, #234e82 50%, #2b6cb0 100%)`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Section 1: Opening Title */}
      <Sequence from={0} durationInFrames={120}>
        <AnimatedTitle
          title={`${year} Impact Report`}
          subtitle="Be A Number, International"
          tagline="15 years of relationship-based development in Northern Uganda"
        />
      </Sequence>

      {/* Section 2: "A Big Year" Transition */}
      <Sequence from={120} durationInFrames={90}>
        <AnimatedTitle
          title="A Turning Point"
          subtitle="From 'Does this work?' to 'This works.'"
        />
      </Sequence>

      {/* Section 3: Workforce & Healthcare Stats */}
      <Sequence from={210} durationInFrames={180}>
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 60,
          }}
        >
          <h2 style={{
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            marginBottom: 50,
            textTransform: 'uppercase',
            letterSpacing: 4,
          }}>
            Community Impact
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 40,
              width: '100%',
              maxWidth: 1600,
            }}
          >
            <StatCounter
              value={stats.womenTrained}
              label="Women Trained"
              sublabel="Vocational & Enterprise Skills"
              delay={0}
              color="#F687B3"
            />
            <StatCounter
              value={stats.menTrained}
              label="Men Trained"
              sublabel="Construction & Technical"
              delay={15}
              color="#63B3ED"
            />
            <StatCounter
              value={stats.localEmployed}
              label="People Employed"
              sublabel="Stable Local Income"
              delay={30}
              color="#68D391"
            />
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Section 4: Healthcare & Youth Stats */}
      <Sequence from={390} durationInFrames={180}>
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 60,
          }}
        >
          <h2 style={{
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            marginBottom: 50,
            textTransform: 'uppercase',
            letterSpacing: 4,
          }}>
            Health & Youth
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 40,
              width: '100%',
              maxWidth: 1600,
            }}
          >
            <StatCounter
              value={stats.medicalServiced}
              label="Patients Served"
              sublabel="Medical Center Now Operational"
              delay={0}
              color="#FC8181"
              suffix="+"
            />
            <StatCounter
              value={stats.youthEngaged}
              label="Youth in Programs"
              sublabel="Sports & Wellness"
              delay={15}
              color="#F6AD55"
              suffix="+"
            />
            <StatCounter
              value={stats.childrenSponsored}
              label="Children Sponsored"
              sublabel="Direct Education Support"
              delay={30}
              color="#B794F4"
            />
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Section 5: Infrastructure */}
      <Sequence from={570} durationInFrames={180}>
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 60,
          }}
        >
          <h2 style={{
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            marginBottom: 50,
            textTransform: 'uppercase',
            letterSpacing: 4,
          }}>
            Infrastructure Built
          </h2>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 40,
              width: '100%',
              maxWidth: 1200,
            }}
          >
            <ProgressBar
              label="Primary School"
              sublabel={`Capacity: ${stats.schoolCapacity} students`}
              percent={stats.schoolCompletion}
              delay={0}
              color="#48BB78"
            />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 30,
              marginTop: 20,
            }}>
              <StatCounter
                value={1}
                label="Medical Center"
                sublabel="Fully Operational"
                delay={30}
                color="#4FD1C5"
                small
              />
              <StatCounter
                value={stats.dormitoriesBuilt}
                label="Dormitories Built"
                sublabel="International Housing"
                delay={45}
                color="#9F7AEA"
                small
              />
              <StatCounter
                value={stats.universityCohortsConfirmed}
                label="University Cohorts"
                sublabel="Confirmed for 2026"
                delay={60}
                color="#F6E05E"
                small
              />
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Section 6: Looking Ahead */}
      <Sequence from={750} durationInFrames={90}>
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 80,
          }}
        >
          <h2 style={{
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            marginBottom: 30,
            textTransform: 'uppercase',
            letterSpacing: 4,
          }}>
            2026 Goals
          </h2>
          <div style={{
            fontSize: 120,
            fontWeight: 800,
            color: '#68D391',
            marginBottom: 20,
          }}>
            5,000
          </div>
          <div style={{
            fontSize: 36,
            color: 'rgba(255,255,255,0.9)',
          }}>
            Patients to serve through expanded medical outreach
          </div>
          <div style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 30,
          }}>
            School opens February 2026 • Teacher housing • Student dormitories
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Section 7: Closing */}
      <Sequence from={840} durationInFrames={60}>
        <AnimatedTitle
          title="Thank You"
          subtitle="For believing in long-term change"
          tagline="beanumber.org"
        />
      </Sequence>

      {/* Persistent Logo */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          right: 40,
          opacity: 0.6,
          color: 'white',
          fontSize: 20,
          fontWeight: 500,
        }}
      >
        Be A Number, International
      </div>
    </AbsoluteFill>
  );
};
