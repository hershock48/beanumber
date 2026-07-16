import { Suspense } from 'react';
import ShirtsPageContent from './ShirtsPageContent';

export const metadata = {
  alternates: { canonical: '/shirts' },
  title: 'Shirts',
  description: 'Every Shirt has a Number. Heavyweight blanks. Handmade to order. Your Number belongs to a real Child.',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What actually happens when I buy a Shirt?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your order number becomes your Shirt Number, and that Number belongs to a real Child enrolled in our program in Northern Uganda. When your Shirt arrives, you\'ll come back to the site, enter your Number, and meet them. $25 starts their year at the campus — school, meals, medical care. $25/month finishes it.',
      },
    },
    {
      '@type': 'Question',
      name: 'Where does the $25 actually go?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your $25/month supports the campus where your kid goes to school, eats two meals a day, and gets medical care through the on-site clinic. The campus runs on the combined support of every sponsor — that\'s also what keeps the 60 women in vocational training, the medical outreach that has served 700+ patients, and the construction apprenticeships going. You\'re not paying line items on one child\'s bill. You\'re supporting the ecosystem that keeps them in school.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I pick my Number?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Numbers are assigned in order so every Child gets a sponsor, not just the ones with the best photos. Your Number isn\'t random — it\'s someone\'s name waiting to be learned.',
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
