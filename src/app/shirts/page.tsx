import { Suspense } from 'react';
import ShirtsPageContent from './ShirtsPageContent';

export const metadata = {
  title: 'Shirts | Be A Number',
  description: 'Every shirt has a number. Heavyweight blanks. Handmade to order. Your number belongs to a real child.',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What actually happens when I buy a shirt?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your order number becomes your shirt number, and that number belongs to a real child enrolled in our program in Northern Uganda. When your shirt arrives, you\'ll come back to the site, enter your number, and meet them. Your $25 covers the shirt and their first month of school, meals, and medical care.',
      },
    },
    {
      '@type': 'Question',
      name: 'Where does the $25 actually go?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your child\'s sponsorship funds education, daily meals, medical care through the on-site clinic, and mentorship. It also supports the community infrastructure around them: vocational training, medical outreach, construction apprenticeships.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I pick my number?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Numbers are assigned in order so every child gets matched, not just the ones with the best photos. Your number isn\'t random — it\'s someone\'s name waiting to be learned.',
      },
    },
    {
      '@type': 'Question',
      name: 'Who is on the ground doing this work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our partner is Youth Development Organisation Uganda (YDO), led by Simon Peter Wilobo in Gulu District. Every program is designed and run by Ugandan leadership. Be A Number provides the systems architecture, funding, and international bridge.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I actually visit?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. We have an international lodge on our campus in Northern Uganda built specifically for sponsor visits and university cohorts. Meeting your child in person is something we actively encourage.',
      },
    },
  ],
};

export default function ShirtsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Suspense>
        <ShirtsPageContent />
      </Suspense>
    </>
  );
}
