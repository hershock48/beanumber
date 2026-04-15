import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy | Be A Number',
  description:
    "How Be A Number, International collects, uses, and protects your personal information. We are a 501(c)(3) nonprofit and we don't sell or rent your data.",
  openGraph: {
    title: 'Privacy Policy | Be A Number',
    description:
      "How Be A Number collects, uses, and protects your personal information.",
    images: undefined,
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | Be A Number',
  },
};

const EFFECTIVE_DATE = 'April 15, 2026';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/privacy" />

      <main className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-16 text-center">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
              Legal
            </p>
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Privacy Policy
            </h1>
            <p className="text-sm text-[#777]">
              Last updated: {EFFECTIVE_DATE}
            </p>
            <div className="w-8 h-px bg-[#D4A843] mx-auto mt-10" />
          </div>

          <div className="space-y-12">
            {/* Plain-English summary */}
            <section className="bg-white border border-[#e8e0d4] rounded-lg p-8">
              <h2
                className="text-xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                The short version
              </h2>
              <p className="text-[#555] leading-relaxed mb-3">
                We&rsquo;re a small 501(c)(3) nonprofit. We don&rsquo;t sell, rent, or trade
                your information. We only use what you give us to fulfill your
                shirt order or sponsorship, send you sponsorship updates if you
                want them, and keep the books clean for our auditors and the IRS.
              </p>
              <p className="text-[#555] leading-relaxed">
                You can opt out of marketing email any time with one click. You
                can ask us what we have on file about you, correct it, or ask us
                to delete it. Write to{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>{' '}
                and we&rsquo;ll take care of it.
              </p>
            </section>

            {/* Who we are */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Who we are
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Be A Number, International is a U.S. 501(c)(3) public charity
                (EIN: 93-1948872), incorporated in 2023. We operate the website
                at beanumber.org and partner with Youth Development Organisation
                Uganda (YDO) to fund community programs in Northern Uganda.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                For any question about this policy or about information we hold,
                email{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>
                .
              </p>
            </section>

            {/* Information we collect */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Information we collect
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                We only collect what we need to do what you&rsquo;ve asked us to do.
                Specifically:
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                <strong>When you buy a shirt or donate:</strong> your name,
                email address, shipping address (if shipping is involved),
                phone number (if you provide one), and how you heard about us.
                Payment card information is collected directly by Stripe, our
                payment processor. We never see or store your full card number;
                we only see the last four digits and basic transaction metadata.
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                <strong>When you become a sponsor:</strong> the above, plus a
                sponsor code we generate for you and a record of your
                sponsorship (which child, monthly amount, start date).
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                <strong>When you log into the sponsor portal:</strong> we set a
                session cookie on your browser so you stay logged in. We do
                not use third-party tracking cookies, advertising pixels, or
                analytics beacons on this site.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                <strong>When you contact us:</strong> whatever you choose to
                include in your message. We keep correspondence so we can
                follow up.
              </p>
            </section>

            {/* How we use it */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                How we use your information
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                We use your information to:
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Process shirt purchases and donations. Issue tax receipts for
                your charitable contributions. Send you the sponsorship
                correspondence you signed up for (monthly campus newsletter,
                photos, a year-end report card, and occasionally a handwritten
                letter from the child you sponsor). Answer your questions.
                Keep financial records for our auditors, our Board, and the
                IRS.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                We do not use your information for behavioral advertising,
                profile-building, or resale. We do not sell your data to
                anyone, ever.
              </p>
            </section>

            {/* Who we share with */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Who we share your information with
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                We share information only with the service providers who help
                us run the organization, and only to the extent they need it to
                do their job for us. Those providers are:
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                <strong>Stripe</strong> processes your payments and holds your
                card information on their secure, PCI-compliant systems.{' '}
                <strong>Airtable</strong> holds our donor, sponsorship, and
                child records.{' '}
                <strong>Google (Gmail) and SendGrid</strong> send the
                transactional and newsletter emails you receive from us.{' '}
                <strong>Vercel</strong> hosts the website itself.
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Each of these providers has their own privacy practices, and we
                only send them what they need to do their piece. We do not
                share your information with advertisers, data brokers, or
                other nonprofits.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                We may disclose information if required by law (a subpoena,
                court order, or government investigation) or if disclosure is
                necessary to protect someone from harm. If that happens we
                will, where lawful, tell you.
              </p>
            </section>

            {/* Cookies */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Cookies and tracking
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                beanumber.org uses one first-party cookie:{' '}
                <code className="bg-[#f4ede1] px-2 py-0.5 rounded text-sm">
                  sponsor_session
                </code>
                . It&rsquo;s set when you log into the sponsor portal and lets
                you stay signed in. It contains only a signed session token
                and your sponsor code; it expires automatically.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                We do not use Google Analytics, Facebook Pixel, Hotjar, or any
                other third-party analytics or advertising trackers on this
                site. Stripe&rsquo;s checkout page (on{' '}
                <code className="bg-[#f4ede1] px-2 py-0.5 rounded text-sm">
                  checkout.stripe.com
                </code>
                ) sets its own cookies for fraud prevention and to remember
                your session; those cookies are governed by Stripe&rsquo;s privacy
                policy.
              </p>
            </section>

            {/* Your rights */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Your rights and choices
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                You can ask us, at any time, to:
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Tell you what information we have on file about you. Correct
                anything that&rsquo;s wrong. Delete your information (subject to the
                records we&rsquo;re legally required to keep for tax and audit
                purposes). Export the information we hold so you can take it
                elsewhere.
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                To make any of these requests, email{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>
                . We&rsquo;ll respond within 30 days. If you live in a state or
                country with specific privacy rights (California, Virginia,
                Colorado, Connecticut, Utah, the EU, the UK, and others), those
                rights apply and we honor them for all users regardless of
                location.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                We will not retaliate against you for exercising any of these
                rights.
              </p>
            </section>

            {/* Email */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Email and unsubscribing
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                We send two kinds of email:
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                <strong>Transactional email.</strong> Receipts, sponsorship
                confirmations, password-style notifications, and anything you
                need for a transaction you initiated. We will
                keep sending these as long as you have an active relationship
                with us, because they are not marketing.
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                <strong>Marketing email.</strong> The monthly campus
                newsletter, photos from the campus, and occasional updates.
                Every marketing email includes a one-click unsubscribe link in
                the footer. Clicking it removes you from the list immediately.
                Major inbox providers also show an &ldquo;Unsubscribe&rdquo; button at the
                top of these emails; that works the same way.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                If you want us to stop sending both kinds of email (including
                transactional), email us directly and we&rsquo;ll mark your record.
                Note that we may still need to contact you about your active
                sponsorship, and some things (like an annual tax receipt)
                can&rsquo;t be suppressed without ending the sponsorship itself.
              </p>
            </section>

            {/* Children */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Children&rsquo;s privacy
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Our website and services are not directed at children under 13,
                and we do not knowingly collect personal information from
                anyone under 13 in the United States (or under 16 in the EU /
                UK) without verifiable parental consent. If you believe we
                have information about a child under 13 (or 16), contact us
                and we will delete it.
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Some children whose information appears on our site and in
                the sponsor portal are children in Northern Uganda whose
                families or legal guardians have given YDO permission to share
                their photo, first name, and grade level with sponsors. This
                information is used only to connect sponsors with the children
                they support and is never used for advertising or sold to
                third parties.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                We take child safety seriously. Sponsors agree, as a condition
                of their account, not to share child photos or identifying
                information publicly. See the Terms of Service for details.
              </p>
            </section>

            {/* Security */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Security
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                We use industry-standard security measures to protect your
                information: HTTPS on every page, encrypted storage at all our
                service providers, short-lived signed tokens for session and
                unsubscribe links, and access controls limiting who on our
                team can see donor records.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                No system is perfect. If we ever discover a breach that affects
                your personal information, we will notify you and the
                appropriate regulators as required by law.
              </p>
            </section>

            {/* Changes */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Changes to this policy
              </h2>
              <p className="text-[#555] leading-relaxed text-lg">
                We will update this policy from time to time as our practices
                change or as the law requires. The date at the top shows when
                it was last revised. If we make a change that meaningfully
                affects what we do with your information, we&rsquo;ll email active
                sponsors and donors at least 30 days before the change takes
                effect.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Contact us
              </h2>
              <p className="text-[#555] leading-relaxed text-lg">
                Questions, corrections, deletion requests, or anything else:{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
