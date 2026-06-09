import type { Metadata } from "next";
import { Lora, Inter } from "next/font/google";
import "./globals.css";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.beanumber.org'),
  title: {
    default: "Be A Number | Every Number Is a Child",
    template: "%s | Be A Number"
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  description: "Every Be A Number Shirt carries a unique Number connected to a real Child in Africa. Find your Number, meet your Child, become their sponsor.",
  keywords: ["child sponsorship", "Africa", "Northern Uganda", "nonprofit", "Be A Number", "sponsor a child", "education", "community development"],
  authors: [{ name: "Be A Number, International" }],
  creator: "Be A Number, International",
  publisher: "Be A Number, International",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.beanumber.org",
    siteName: "Be A Number",
    title: "Be A Number | Every Number Is a Child",
    description: "Every Be A Number Shirt carries a unique Number connected to a real Child in Africa. Find your Number, meet your Child, become their sponsor.",
    images: [
      {
        url: "/images/homepage/hero-community-group.jpg",
        width: 1200,
        height: 630,
        alt: "Children in Northern Uganda",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Be A Number | Every Number Is a Child",
    description: "Every shirt carries a number. Every number is a child.",
    images: ["/images/homepage/hero-community-group.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'NonprofitOrganization',
              name: 'Be A Number, International',
              alternateName: 'BAN',
              url: 'https://www.beanumber.org',
              logo: 'https://www.beanumber.org/icon.svg',
              description:
                'US 501(c)(3) funding education, meals, medical care, and mentorship for children at the YDO campus in Omoro District, Northern Uganda.',
              foundingDate: '2023',
              founder: {
                '@type': 'Person',
                name: 'Kevin Hershock',
              },
              address: {
                '@type': 'PostalAddress',
                streetAddress: '108 N. Sycamore Street',
                addressLocality: 'Marshall',
                addressRegion: 'MI',
                postalCode: '49068',
                addressCountry: 'US',
              },
              contactPoint: {
                '@type': 'ContactPoint',
                email: 'kevin@beanumber.org',
                contactType: 'customer service',
              },
              sameAs: [
                'https://instagram.com/beanumber_',
                'https://www.facebook.com/beanumber',
                'https://www.tiktok.com/@beanumber',
              ],
              taxID: '93-1948872',
              nonprofitStatus: '501c3',
            }),
          }}
        />
      </head>
      <body className={`${lora.variable} ${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
