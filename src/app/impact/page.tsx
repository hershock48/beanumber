import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

export const metadata: Metadata = {
  title: '2025 Impact',
  description:
    'What happened on six acres in Northern Uganda in 2025. 700+ patients treated, 68 adults trained, 30 local jobs, school capacity for 380.',
  openGraph: {
    title: '2025 Impact | Be A Number',
    description:
      '700+ patients, 68 adults trained, 30 community jobs, school capacity for 380. Measured outcomes from a six-acre campus in Omoro District.',
    images: ['/images/impact-page/lead-image.jpg'],
  },
};

const impactJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Six Acres. One Year. Here\'s What Happened.',
  description: 'What happened on six acres in Northern Uganda in 2025. 700+ patients treated, 68 adults trained, 30 local jobs, school capacity for 380.',
  author: { '@type': 'Person', name: 'Kevin Hershock' },
  publisher: {
    '@type': 'NonprofitOrganization',
    name: 'Be A Number, International',
    logo: { '@type': 'ImageObject', url: 'https://www.beanumber.org/icon.svg' },
  },
  url: 'https://www.beanumber.org/impact',
  image: 'https://www.beanumber.org/images/impact-page/lead-image.jpg',
  mainEntityOfPage: 'https://www.beanumber.org/impact',
};

export default function Impact() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(impactJsonLd) }}
      />
      <BANNavigation currentPath="/impact" />

      {/* ========== HERO ========== */}
      <section className="relative w-full h-[55vh] min-h-[440px] bg-[#0d0d0d]">
        <Image
          src="/images/impact-page/lead-image.jpg"
          alt="The campus in Northern Uganda"
          fill
          className="object-cover opacity-60"
          priority
        />
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-4xl mx-auto px-6 pb-12 w-full">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-4">
              2025 Impact
            </p>
            <h1
              className="text-4xl md:text-5xl text-[#FFF8F0] leading-tight mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Six acres. One year.<br />Here&rsquo;s what happened.
            </h1>
            <p className="text-[#FFF8F0]/70 text-lg max-w-xl">
              Measured outcomes from the campus in Omoro District, Northern Uganda.
            </p>
          </div>
        </div>
      </section>

      {/* ========== CONTEXT BLOCK ========== */}
      <section className="py-16 px-6 border-b border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-lg text-[#555] leading-relaxed mb-6">
            When the LRA conflict wound down in the late 2000s, most organizations packed up.
            The cameras moved on. The money followed. What remained were communities trying to
            rebuild from nothing, with almost no one still standing beside them.
          </p>
          <p className="text-lg text-[#555] leading-relaxed">
            Be A Number exists in that gap. Not as a crisis-response organization, but as a
            long-term partner to a community doing the slow, unfilmed work of rebuilding. In 2025,
            here&rsquo;s what that looked like on the ground.
          </p>
        </div>
      </section>

      {/* ========== PRIMARY STATS ========== */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                number: '700+',
                label: 'Patients treated',
                detail: 'Medical outreach through the on-site clinic and community health drives',
              },
              {
                number: '68',
                label: 'Adults trained',
                detail: '60 women in sewing and vocational skills, 8 men in construction trades',
              },
              {
                number: '30',
                label: 'Community jobs',
                detail: 'Teachers, clinic staff, cooks, mentors, and administrators from the local community',
              },
              {
                number: '380',
                label: 'School capacity',
                detail: 'Nursery and primary school on campus, open and serving Omoro District',
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-white border border-[#e8e0d4] p-6">
                <p
                  className="text-4xl text-[#D4A843] mb-1"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                >
                  {stat.number}
                </p>
                <p className="font-semibold text-[#0d0d0d] text-sm mb-2">{stat.label}</p>
                <p className="text-[#777] text-sm leading-relaxed">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FOUR SYSTEMS ========== */}
      <section className="py-16 px-6 bg-white border-y border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6 text-center">
            How It Works
          </p>
          <h2
            className="text-3xl text-[#0d0d0d] mb-4 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Four systems. One campus.
          </h2>
          <p className="text-[#777] text-center mb-12 max-w-xl mx-auto">
            Everything runs on the same six acres. The school, the clinic, the training
            center, and the jobs are all connected. That&rsquo;s the point.
          </p>

          <div className="space-y-10">
            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Education
              </h3>
              <p className="text-[#555] leading-relaxed">
                A nursery and primary school built for 380 students, staffed by
                teachers from the local community. Every child gets daily meals (morning
                porridge and a midday meal prepared on campus), school supplies, a uniform,
                and access to the medical center. The school doesn&rsquo;t exist to check a
                box. It exists because the closest alternative is a long walk away and costs
                money most families here don&rsquo;t have.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Health
              </h3>
              <p className="text-[#555] leading-relaxed">
                An on-site medical center that serves both students and the surrounding
                community. In 2025, more than 700 patients were treated through clinic visits
                and community health outreach. For many families in Omoro District, this is the
                closest medical care they can reach.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Workforce development
              </h3>
              <p className="text-[#555] leading-relaxed">
                Sixty women completed sewing and vocational training in 2025. Eight men
                completed construction apprenticeships. These aren&rsquo;t theoretical
                programs. The women sew school uniforms that the students wear. The
                construction apprentices build the buildings the programs run in. The training
                feeds back into the campus, and the graduates leave with skills that work in
                the local economy.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Economic infrastructure
              </h3>
              <p className="text-[#555] leading-relaxed">
                Thirty people from the surrounding community are employed to run the campus.
                Teachers, clinic staff, cooks, administrators, mentors. In a region where
                formal employment is rare, those 30 paychecks support entire households. The
                campus isn&rsquo;t just serving the community. It&rsquo;s employing it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SECONDARY IMAGE ========== */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full aspect-[16/9] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden">
            <Image
              src="/images/impact-page/lead-image-kevin.png"
              alt="Kevin seated with a mother and child in Northern Uganda"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* ========== FINANCIALS ========== */}
      <section className="py-16 px-6 bg-[#0d0d0d]">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6 text-center">
            Financial Stewardship
          </p>
          <h2
            className="text-3xl text-[#FFF8F0] mb-4 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Where the money went in 2025
          </h2>
          <p className="text-[#777] text-center mb-12 max-w-xl mx-auto">
            Be A Number, International is a 501(c)(3) public charity (EIN 93-1948872).
            All financial reports are independently reviewed and publicly available.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            <div className="border border-[#333] p-6 text-center">
              <p
                className="text-4xl text-[#D4A843] mb-1"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                $79,623
              </p>
              <p className="text-[#FFF8F0] text-sm font-semibold mb-1">Total raised &amp; deployed</p>
              <p className="text-[#777] text-xs">Fiscal year 2025</p>
            </div>
            <div className="border border-[#333] p-6 text-center">
              <p
                className="text-4xl text-[#D4A843] mb-1"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                30
              </p>
              <p className="text-[#FFF8F0] text-sm font-semibold mb-1">Local jobs</p>
              <p className="text-[#777] text-xs">Community members employed on campus</p>
            </div>
            <div className="border border-[#333] p-6 text-center">
              <p
                className="text-4xl text-[#D4A843] mb-1"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                380
              </p>
              <p className="text-[#FFF8F0] text-sm font-semibold mb-1">Children enrolled</p>
              <p className="text-[#777] text-xs">Full-time school, meals, and medical care</p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto">
            <p className="text-[#999] text-sm leading-relaxed text-center">
              Full financial reports are independently reviewed and available on
              our <a href="/reports/2025-impact-financial-summary" className="text-[#D4A843] underline">2025 financial summary</a> page.
            </p>
          </div>
        </div>
      </section>

      {/* ========== THE GROUND TEAM ========== */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6 text-center">
            On the Ground
          </p>
          <h2
            className="text-3xl text-[#0d0d0d] mb-4 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Who runs this
          </h2>
          <p className="text-[#777] text-center mb-12 max-w-xl mx-auto">
            Not an international NGO. Not a fly-in team. The campus is Acholi land,
            run by Acholi leadership.
          </p>

          <div className="space-y-6">
            <p className="text-[#555] leading-relaxed">
              Youth Development Organisation Uganda (YDO), founded and led by Simon Peter
              Wilobo, designs and runs every program on the campus. Simon grew up during
              the LRA conflict, in the same generation whose childhoods the war consumed.
              He came out the other side determined to rebuild from within his own community,
              not through outside organizations.
            </p>

            <p className="text-[#555] leading-relaxed">
              Today his team of 30 local staff and volunteers runs the school, the clinic,
              the training programs, and the mentorship. They don&rsquo;t work in the
              community so much as they are the community. The programs they build are
              designed to outlast any external support.
            </p>

            <p className="text-[#555] leading-relaxed">
              Kevin Hershock, in Michigan, built the systems that fund it: the shirts, the
              sponsorship model, the donor infrastructure, and the bridge that connects
              American sponsors to Ugandan children. Neither half works without the other.
            </p>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/founder"
              className="text-sm text-[#D4A843] hover:underline"
            >
              Read the full story &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ========== BOTTOM CTA ========== */}
      <section className="py-16 px-6 border-t border-[#e8e0d4]">
        <div className="max-w-2xl mx-auto text-center">
          <h2
            className="text-3xl text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Be part of what 2026 looks like.
          </h2>
          <p className="text-[#777] mb-8 max-w-lg mx-auto leading-relaxed">
            $25/month sponsors a child. A shirt starts the connection. A donation
            funds the ecosystem. Pick the one that fits.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/shirts"
              className="px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
            >
              Get a Shirt
            </Link>
            <Link
              href="/donate"
              className="px-8 py-4 border border-[#e8e0d4] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:border-[#D4A843]/50 transition-colors"
            >
              Donate
            </Link>
          </div>

          <div className="mt-10">
            <Link
              href="/reports/2025-impact-financial-summary"
              className="text-xs text-[#999] hover:text-[#D4A843] transition-colors"
            >
              View the full 2025 financial summary &rarr;
            </Link>
          </div>
        </div>
      </section>

      <BANFooter />
    </div>
  );
}
