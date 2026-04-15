import type { Metadata } from 'next';
import { HomePageContent } from './HomePageContent';

export const metadata: Metadata = {
  title: "Be A Number | Every Number Is a Child",
  description: "Every Be A Number shirt carries a unique number connected to a real child in Africa. Find your number, meet your child, $25 gets you a shirt and sponsors a child for your first month.",
  openGraph: {
    title: "Be A Number | Every Number Is a Child",
    description: "Every shirt carries a number. Every number is a child. Find yours and start a story.",
    images: ["/images/homepage/hero-community-group.jpg"],
  },
};

export default function Home() {
  return <HomePageContent />;
}
