import { Suspense } from 'react';
import RepDashboardContent from './RepDashboardContent';

export const metadata = {
  title: 'Cohort Dashboard | Be A Number',
  description: 'Track your scholarship progress, referral stats, and see the cohort leaderboard.',
  robots: { index: false, follow: false },
};

export default function RepDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center">
        <p className="text-[#777]">Loading...</p>
      </div>
    }>
      <RepDashboardContent />
    </Suspense>
  );
}
