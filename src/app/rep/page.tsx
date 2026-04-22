import RepPageContent from './RepPageContent';

export const metadata = {
  title: 'Be A Rep | Be A Number',
  description: 'Build a sponsorship team. Go meet the kids. Be A Number ambassador program for college students and community leaders.',
  robots: { index: false, follow: false }, // Hidden until Kevin is ready
};

export default function RepPage() {
  return <RepPageContent />;
}
