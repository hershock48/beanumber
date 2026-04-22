import RepDashboardContent from './RepDashboardContent';

export const metadata = {
  title: 'Rep Dashboard | Be A Number',
  description: 'Track your progress, see your referral stats, and view the cohort leaderboard.',
  robots: { index: false, follow: false },
};

export default function RepDashboardPage() {
  return <RepDashboardContent />;
}
