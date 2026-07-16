import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    "The rules for using beanumber.org, buying shirts, and sponsoring children at the campus in Northern Uganda.",
  openGraph: {
    title: 'Terms of Service | Be A Number',
    description:
      "The rules for using beanumber.org, buying shirts, and sponsoring children at the campus in Northern Uganda.",
    images: undefined,
  },
  twitter: {
    card: 'summary',
    title: 'Terms of Service | Be A Number',
  },
};

const EFFECTIVE_DATE = 'April 15, 2026';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/terms" />

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
              Terms of Service
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
                By using beanumber.org, buying a shirt, or becoming a sponsor,
                you&rsquo;re agreeing to these terms. They&rsquo;re written plainly on
                purpose. The most important ones, if you&rsquo;re short on time:
              </p>
              <p className="text-[#555] leading-relaxed mb-3">
                (1) Sponsorships renew monthly until you cancel. You can cancel
                any time for any reason. (2) Shirt orders ship from a small
                team and may take a few weeks. (3) Photos, names, and stories
                of sponsored children are shared with you privately and must
                stay private. Do not post them publicly. (4) We&rsquo;re governed
                by the laws of the State of Michigan.
              </p>
              <p className="text-[#555] leading-relaxed">
                Questions:{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>
                .
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
              <p className="text-[#555] leading-relaxed text-lg">
                Be A Number, International is a U.S. 501(c)(3) public charity
                (EIN: 93-1948872), incorporated in 2023 and headquartered in
                Marshall, Michigan. In these terms, &ldquo;Be A Number,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
                and &ldquo;our&rdquo; refer to Be A Number, International. &ldquo;You&rdquo; refers
                to the person using this site, buying a shirt, or sponsoring
                a child. &ldquo;YDO&rdquo; refers to Youth Development Organisation
                Uganda, our program partner in Omoro District, Northern Uganda.
              </p>
            </section>

            {/* Acceptance */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Accepting these terms
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                By visiting beanumber.org, creating a sponsor account, placing
                a shirt order, or making a donation, you agree to these terms
                and to our{' '}
                <a href="/privacy" className="text-[#D4A843] underline">
                  Privacy Policy
                </a>
                . If you don&rsquo;t agree, please don&rsquo;t use the site.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                You must be at least 18 years old (or the age of majority in
                your jurisdiction) to create an account, make a purchase, or
                sponsor a child.
              </p>
            </section>

            {/* Accounts */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Sponsor accounts and login
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                When you become a sponsor we issue you a private sponsor code
                and a login link. Keep these to yourself. Anyone with your
                sponsor code and email can see the private updates about the
                child you sponsor, including photos and first names. Treat it
                like you&rsquo;d treat a password.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                You&rsquo;re responsible for the activity that happens under your
                account. If you think someone else has your code, email us
                and we&rsquo;ll rotate it.
              </p>
            </section>

            {/* Shirt purchases */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Shirt purchases and shipping
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Every numbered shirt you buy carries the number of a specific
                child at the campus in Omoro District. The price of the shirt
                covers manufacturing and shipping, and the balance supports
                the campus where that child attends school, eats meals, and
                receives medical care.
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                We&rsquo;re a small team. Orders are typically shipped within 2 to
                3 weeks, but during campaign launches or around holidays it
                can take longer. We&rsquo;ll email you a tracking number when your
                order ships.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                If your shirt arrives damaged, wrong, or doesn&rsquo;t arrive at
                all, email{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>{' '}
                within 30 days and we&rsquo;ll make it right. Because each order&rsquo;s
                proceeds are deployed to the campus immediately, we generally don&rsquo;t accept
                returns for buyer&rsquo;s remorse, but we&rsquo;ll work with you on
                anything reasonable.
              </p>
            </section>

            {/* Sponsorship */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Sponsorship and recurring donations
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                When you sponsor a child, you authorize Be A Number to charge
                your payment method the selected amount each month. Your
                sponsorship continues until you cancel it.
              </p>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                You can cancel any time, for any reason, by emailing{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>{' '}
                or by using the cancellation link in the sponsor portal.
                Cancellation takes effect immediately and will stop future
                charges. We don&rsquo;t prorate or refund the current month&rsquo;s
                payment unless there&rsquo;s a billing error on our end.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                If a charge fails (expired card, closed account, etc.) we&rsquo;ll
                email you and retry once or twice before pausing the
                sponsorship. We won&rsquo;t send your file to collections or
                report anything to a credit bureau.
              </p>
            </section>

            {/* Tax */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Tax receipts and deductibility
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Be A Number is a 501(c)(3) public charity (EIN: 93-1948872).
                Charitable contributions to us are generally tax-deductible in
                the United States to the extent allowed by law. The portion
                of a shirt purchase that exceeds the fair market value of the
                shirt itself is treated as a charitable contribution; the
                receipt we email you will make that breakdown explicit.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                We are not your tax advisor. For your specific situation,
                please consult a qualified tax professional. Tax treatment
                outside the United States varies by country and we make no
                representation about deductibility there.
              </p>
            </section>

            {/* Child privacy: the important one */}
            <section className="bg-white border border-[#e8e0d4] rounded-lg p-8">
              <h2
                className="text-xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Protecting the children you sponsor
              </h2>
              <p className="text-[#555] leading-relaxed mb-3">
                This section matters. The children you see in the sponsor
                portal are real kids at a school in Northern Uganda. Their
                families and guardians have allowed YDO to share their photo,
                first name, and grade level with sponsors so that sponsorship
                is personal. That consent is specifically for sponsors, not
                for the public internet.
              </p>
              <p className="text-[#555] leading-relaxed mb-3">
                As a condition of your sponsor account, you agree NOT to:
              </p>
              <p className="text-[#555] leading-relaxed mb-3">
                Post photos of the children on social media, blogs, newsletters,
                church bulletins, fundraising appeals, or anywhere else publicly
                accessible. Share their first names, last names, grade levels,
                village names, or any other identifying information with anyone
                outside your immediate household. Use the photos or information
                in any AI training dataset, generative model, or other automated
                system. Screenshot and share the sponsor portal with anyone,
                including on private group chats or shared drives accessible
                to people who aren&rsquo;t the sponsor. Visit the campus, contact
                the children directly, or attempt to establish contact outside
                the channels coordinated through Be A Number and YDO.
              </p>
              <p className="text-[#555] leading-relaxed mb-3">
                If you want to share about your sponsorship publicly, please
                do. Share the campus, the school, the programs, or a photo
                of your numbered shirt. Just don&rsquo;t share photos or identifying
                details of the specific child you sponsor.
              </p>
              <p className="text-[#555] leading-relaxed">
                We take this seriously. If we see a sponsor publishing child
                photos or identifying information, we&rsquo;ll ask you to remove
                them. If it&rsquo;s not resolved promptly, we will terminate the
                sponsorship. In egregious cases, or where we believe a child&rsquo;s
                safety is at risk, we will report to appropriate authorities.
              </p>
            </section>

            {/* Acceptable use */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Acceptable use of the site
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                Don&rsquo;t use beanumber.org to do anything illegal, abusive, or
                damaging. Specifically, don&rsquo;t try to break into the site,
                probe for vulnerabilities without permission, scrape content
                at scale, submit fraudulent payment information, impersonate
                another person, or interfere with anyone else&rsquo;s use of the
                site.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                If you&rsquo;re a security researcher who has found a vulnerability,
                please email{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>{' '}
                with the details. We&rsquo;ll respond, we&rsquo;ll fix the issue, and
                we&rsquo;ll credit you if you&rsquo;d like.
              </p>
            </section>

            {/* IP */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Intellectual property
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                The text, photos, artwork, logos, and source code on this
                site are owned by Be A Number, International or our partners,
                and are protected by copyright and trademark law. You may
                read, print, and share individual pages for personal,
                non-commercial use and in keeping with the child privacy
                section above.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                The &ldquo;Be A Number&rdquo; name, the logo, and the numbered-shirt
                concept are ours. Please don&rsquo;t use them to imply endorsement
                or to fundraise on our behalf without written permission.
              </p>
            </section>

            {/* Disclaimers */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Disclaimers
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                The site and our services are provided on an &ldquo;as is&rdquo; and
                &ldquo;as available&rdquo; basis. We do our honest best to keep the
                site up, accurate, and secure, but we don&rsquo;t guarantee that
                it will always be available, error-free, or suitable for any
                particular purpose.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                To the maximum extent permitted by law, we disclaim all
                warranties, express or implied, including warranties of
                merchantability, fitness for a particular purpose, and
                non-infringement.
              </p>
            </section>

            {/* Liability */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Limitation of liability
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                To the maximum extent permitted by law, Be A Number and its
                officers, directors, employees, and volunteers will not be
                liable for indirect, incidental, special, consequential, or
                punitive damages arising out of or related to your use of
                the site or our services.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                Our total aggregate liability to you for any claim arising
                from these terms or your use of the site is limited to the
                amount you paid to Be A Number in the 12 months preceding
                the event that gave rise to the claim.
              </p>
            </section>

            {/* Indemnification */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Indemnification
              </h2>
              <p className="text-[#555] leading-relaxed text-lg">
                You agree to indemnify and hold harmless Be A Number and its
                officers, directors, employees, and volunteers from any
                claim, loss, or expense (including reasonable attorneys&rsquo;
                fees) arising from your violation of these terms, your
                violation of the rights of a child or family in our program,
                or your misuse of the site.
              </p>
            </section>

            {/* Termination */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Termination
              </h2>
              <p className="text-[#555] leading-relaxed text-lg">
                We may suspend or terminate your account or your sponsorship
                if you materially violate these terms, especially the child
                privacy section. In most cases we&rsquo;ll reach out first, explain
                what we&rsquo;re seeing, and give you a chance to fix it. You can
                terminate your account or sponsorship at any time by emailing
                us.
              </p>
            </section>

            {/* Changes */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Changes to these terms
              </h2>
              <p className="text-[#555] leading-relaxed text-lg">
                We may update these terms from time to time. The &ldquo;Last
                updated&rdquo; date at the top shows when. If we make a change
                that materially affects your rights or obligations, we&rsquo;ll
                email active sponsors and donors at least 30 days before it
                takes effect. Continued use of the site after an update
                means you accept the updated terms.
              </p>
            </section>

            {/* Governing law */}
            <section>
              <h2
                className="text-2xl text-[#0d0d0d] mb-4"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Governing law and disputes
              </h2>
              <p className="text-[#555] leading-relaxed text-lg mb-3">
                These terms are governed by the laws of the State of Michigan,
                without regard to its conflict-of-laws rules. Any dispute
                arising from these terms or your use of the site will be
                resolved exclusively in the state or federal courts located
                in Calhoun County, Michigan, and you consent to personal
                jurisdiction there.
              </p>
              <p className="text-[#555] leading-relaxed text-lg">
                Before filing anything formal, please email us. The great
                majority of issues get resolved with one honest conversation.
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
                Questions about these terms, an order, a sponsorship, or
                anything else:{' '}
                <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] underline">
                  kevin@beanumber.org
                </a>
                . Mail: Be A Number, International, 108 N. Sycamore Street,
                Marshall, MI 49068.
              </p>
            </section>
          </div>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
