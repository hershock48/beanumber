import type { Metadata } from 'next';
import { HomePageContent } from './HomePageContent';
import { getHomepageRoster } from '@/lib/homepage-roster';

// ISR: regenerate at most hourly. The kid carousel used to be
// client-fetched (blank slots + pop-in after hydration, nothing in
// the HTML for search engines); now it's server-rendered from the
// same roster source /api/children uses. Hourly regeneration keeps
// the page CDN-fast, picks up roster changes within the hour, and
// re-shuffles which kids lead the carousel — the old client-side
// per-visit shuffle traded first-paint for variety; per-hour is
// variety enough.
export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  title: "Be A Number | Every Number Is a Child",
  description: "Every Be A Number shirt carries a unique number connected to a real child in Africa. Find your number, meet your child, $25 gets you a shirt and sponsors a child for your first month.",
  openGraph: {
    title: "Be A Number | Every Number Is a Child",
    description: "Every shirt carries a number. Every number is a child. Find yours and start a story.",
    images: ["/images/homepage/hero-community-group.jpg"],
  },
};

export default async function Home() {
  let roster: Awaited<ReturnType<typeof getHomepageRoster>> = [];
  try {
    roster = await getHomepageRoster();
  } catch (err) {
    // DB hiccup at regeneration time — render with an empty roster
    // (the carousel section hides itself) rather than failing the
    // whole homepage.
    console.warn('[home] roster fetch failed:', err);
  }
  // Server-side shuffle, once per regeneration. Fisher–Yates.
  const shuffled = [...roster];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return <HomePageContent initialChildren={shuffled} />;
}
