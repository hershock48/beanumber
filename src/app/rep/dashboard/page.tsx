import { Suspense } from 'react';
import RepDashboardContent from './RepDashboardContent';

export const metadata = {
  title: 'Rep Dashboard | Be A Number',
  description: 'Track your progress, see your referral stats, and view the cohort leaderboard.',
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
