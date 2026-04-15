import { Composition } from 'remotion';
import { ImpactReportVideo } from './compositions/ImpactReportVideo';
import { ImpactReelVideo } from './compositions/ImpactReelVideo';

// Remotion v4 types <Composition component> as accepting only components whose
// props extend Record<string, unknown>. Our video components are typed more
// tightly with their own Props interfaces, which is what we want at call sites,
// but it clashes with the Composition registration. Cast here so we don't have
// to relax the real component types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ImpactReportVideoAny = ImpactReportVideo as unknown as React.FC<Record<string, unknown>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ImpactReelVideoAny = ImpactReelVideo as unknown as React.FC<Record<string, unknown>>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Original horizontal version */}
      <Composition
        id="ImpactReport"
        component={ImpactReportVideoAny}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          year: 2025,
          stats: {
            womenTrained: 60,
            menTrained: 8,
            localEmployed: 30,
            medicalServiced: 700,
            youthEngaged: 60,
            childrenSponsored: 15,
            schoolCapacity: 380,
            schoolCompletion: 95,
            dormitoriesBuilt: 3,
            universityCohortsConfirmed: 4,
            patientGoal2026: 5000,
          },
        }}
      />

      {/* Instagram Reel version - vertical, punchy */}
      <Composition
        id="ImpactReel"
        component={ImpactReelVideoAny}
        durationInFrames={450} // 15 seconds at 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          stats: {
            womenTrained: 60,
            menTrained: 8,
            localEmployed: 30,
            medicalServiced: 700,
            youthEngaged: 60,
            childrenSponsored: 15,
            schoolCompletion: 95,
          },
        }}
      />
    </>
  );
};
