'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BANNavigationClient as BANNavigation } from '@/components/BANNavigationClient';
import { BANFooter } from '@/components/BANFooter';

const TRIP_COST = 3000;
const DEPOSIT = 500;
const CREDIT_PER_SPONSOR = 100;
const SPONSOR_GOAL = 24;
const TRIP_LENGTH = '10 days';
const TRIP_DATE = 'October 2026';
const COHORT_SIZE = 10;
const RAMP_MONTHS = 6;
const MIN_OUT_OF_POCKET = TRIP_COST - (SPONSOR_GOAL * CREDIT_PER_SPONSOR) + DEPOSIT;

export default function RepPageContent() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    school: '',
    organization: '',
    why: '',
    first_five: '',
    how_heard: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/rep/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/rep" />

      {/* Hero */}
      <section className="relative">
        <div className="relative w-full h-[50vh] min-h-[400px] bg-[#0d0d0d]">
          <Image
            src="/images/homepage/hero-community-group.jpg"
            alt="Community members gathered at the campus in Northern Uganda"
            fill
            className="object-cover opacity-60"
            priority
          />
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div className="max-w-3xl text-center">
              <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
                Founding Cohort &middot; {TRIP_DATE}
              </p>
              <h1
                className="text-4xl md:text-5xl lg:text-6xl text-white mb-6"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Go meet the kids.
              </h1>
              <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
                {COHORT_SIZE} spots. {TRIP_LENGTH} on the ground in Northern Uganda.
                The first group. The first trip. The kids already know you&apos;re coming.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The deal */}
      <section className="py-16 px-5">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            The deal
          </p>

          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10 mb-8">
            <p className="text-[#555] leading-relaxed mb-6">
              Be A Number is opening our first-ever Sponsorship Cohort Trip to the
              campus in Northern Uganda. {COHORT_SIZE} spots. {TRIP_LENGTH}. Meet your
              sponsored child. Walk the campus with Simon. See the school, the clinic,
              the training center. Sit with the families your sponsorship supports.
            </p>
            <p
              className="text-2xl text-[#0d0d0d] mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              ${TRIP_COST.toLocaleString()} all-in.
            </p>
            <p className="text-sm text-[#777]">
              Flights, visas, lodging, meals, ground transport. Everything.
            </p>
          </div>

          {/* How it works steps */}
          <div className="space-y-10">
            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                1. Sponsor a child yourself
              </h3>
              <p className="text-[#555] leading-relaxed">
                Every cohort member is an active sponsor. You get your own number,
                your own child, your own connection to the campus before you ever
                set foot on it. $25/month.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                2. Invite your people
              </h3>
              <p className="text-[#555] leading-relaxed">
                You get a personal referral link. For every new monthly sponsor you bring
                in who stays active through month 3, you earn ${CREDIT_PER_SPONSOR} toward
                your trip. Share it with friends, your church, your campus group, your
                family. The people in your life who would care about this if you told
                them about it.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                3. Watch it add up
              </h3>
              <p className="text-[#555] leading-relaxed">
                Bring in {SPONSOR_GOAL} sponsors over {RAMP_MONTHS} months and your trip
                is essentially covered. Your dashboard tracks every referral in real time.
                You can see exactly where you stand and how the rest of the cohort is doing.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                4. Go
              </h3>
              <p className="text-[#555] leading-relaxed">
                {TRIP_DATE}. You walk onto the campus and the kids already know your
                name because Kevin told them you were coming. You sit in their classrooms,
                eat meals together, play football on the same pitch they play on every day.
                You see what your network built, in person, with the children standing right
                in front of you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Photo break */}
      <section className="px-5 pb-8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 gap-4">
          <div className="relative aspect-[4/3] bg-[#f5f0e8] overflow-hidden">
            <Image
              src="/images/story/kids-hugging.jpg"
              alt="Children at the campus"
              fill
              className="object-cover"
            />
          </div>
          <div className="relative aspect-[4/3] bg-[#f5f0e8] overflow-hidden">
            <Image
              src="/images/impact-page/lead-image-kevin.jpg"
              alt="Kevin with a mother and child in Northern Uganda"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* The math */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            The math
          </p>

          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10">
            <div className="space-y-6">
              <div className="flex justify-between items-baseline border-b border-[#f0ece4] pb-4">
                <span className="text-[#555]">Trip cost</span>
                <span
                  className="text-xl text-[#0d0d0d]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  ${TRIP_COST.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-[#f0ece4] pb-4">
                <span className="text-[#555]">Non-refundable deposit at acceptance</span>
                <span
                  className="text-xl text-[#0d0d0d]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  ${DEPOSIT.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-[#f0ece4] pb-4">
                <span className="text-[#555]">Scholarship credit per sponsor (after month 3)</span>
                <span
                  className="text-xl text-[#0d0d0d]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  ${CREDIT_PER_SPONSOR}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-[#f0ece4] pb-4">
                <span className="text-[#555]">Sponsors needed to max out your credit</span>
                <span
                  className="text-xl text-[#0d0d0d]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {SPONSOR_GOAL}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2">
                <span className="text-[#0d0d0d] font-semibold">Minimum out-of-pocket if you hit {SPONSOR_GOAL}</span>
                <span
                  className="text-2xl text-[#D4A843]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                >
                  ${MIN_OUT_OF_POCKET.toLocaleString()}
                </span>
              </div>
            </div>

            <p className="text-sm text-[#777] mt-8 leading-relaxed">
              The ${DEPOSIT} deposit is due when you&apos;re accepted. Scholarship credits
              accumulate as your referred sponsors hit their 3-month mark. Balance is due
              30 days before the trip. If your credits don&apos;t cover the full balance,
              you pay the difference.
            </p>
          </div>
        </div>
      </section>

      {/* What the 6 months look like */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            The {RAMP_MONTHS} months before the trip
          </p>

          <p className="text-[#555] leading-relaxed mb-8">
            You&apos;re not doing this alone. Kevin runs a monthly call with the cohort
            to keep everyone connected and prepared.
          </p>

          <div className="space-y-4">
            {[
              {
                month: 'Month 1',
                title: 'Orientation',
                desc: 'Who Simon\'s team is, what the campus looks like, what the 10 days will be. You\'ll leave this call knowing exactly what you\'re working toward.',
              },
              {
                month: 'Month 2',
                title: 'How to have the conversation',
                desc: 'How to invite people to sponsor without being weird about it. What to say, what not to say, what actually works.',
              },
              {
                month: 'Month 3',
                title: 'Travel prep',
                desc: 'Visa, vaccines, packing, safety, cultural norms. Everything you need to know before you board a plane.',
              },
              {
                month: 'Month 4',
                title: 'The campus and the community',
                desc: 'Deeper dive into what you\'ll see on the ground. The school, the clinic, the vocational center, the families. Context that will make the trip hit different.',
              },
              {
                month: 'Month 5',
                title: 'Meeting your child',
                desc: 'What to do when you\'re standing in front of the kid whose name you\'ve been carrying for months. Most people cry. Some people freeze. We\'ll talk about it so you\'re ready.',
              },
              {
                month: 'Month 6',
                title: 'What you carry home',
                desc: 'The trip isn\'t the end. It\'s the start. What we\'re asking you to do with the story when you get back.',
              },
            ].map((item) => (
              <div key={item.month} className="flex gap-4 bg-white border border-[#e8e0d4] p-5">
                <div className="shrink-0">
                  <span className="text-xs font-bold text-[#D4A843] uppercase tracking-wider">
                    {item.month}
                  </span>
                </div>
                <div>
                  <h4
                    className="text-base text-[#0d0d0d] mb-1"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    {item.title}
                  </h4>
                  <p className="text-sm text-[#555] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you carry home */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            After the trip
          </p>

          <div className="space-y-4 text-[#555] leading-relaxed mb-8">
            <p>
              The trip is the forge, not the finish line. When you get home, you carry the
              story. Founding Cohort members commit to three things in the year after returning:
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-[#e8e0d4] p-6">
              <h4
                className="text-base text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Host a gathering
              </h4>
              <p className="text-sm text-[#555] leading-relaxed">
                Within 90 days of returning, invite people over. Tell the story. Show
                the photos. Invite them to sponsor. No stage, no production. Your
                living room and the truth.
              </p>
            </div>

            <div className="bg-white border border-[#e8e0d4] p-6">
              <h4
                className="text-base text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Tell the story publicly
              </h4>
              <p className="text-sm text-[#555] leading-relaxed">
                A blog post, an Instagram carousel, a newsletter to your people. Within
                30 days. One honest piece about what you saw and why it matters. In your
                own words, to your own audience.
              </p>
            </div>

            <div className="bg-white border border-[#e8e0d4] p-6">
              <h4
                className="text-base text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Stay on as a cohort alum
              </h4>
              <p className="text-sm text-[#555] leading-relaxed">
                For at least 12 months after the trip, you&apos;re part of the alumni
                network. That means you&apos;re available when we need a voice, you
                mentor the next cohort, and you get early access to future trips and
                new shirt numbers before anyone else.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Photo before form */}
      <section className="px-5 pb-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full aspect-[21/9] bg-[#f5f0e8] overflow-hidden">
            <Image
              src="/images/homepage/hero-community-group.jpg"
              alt="Community members gathered at the campus"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Application form */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]" id="apply">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-4">
            Apply
          </p>
          <h2
            className="text-3xl text-[#0d0d0d] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Join the Founding Cohort
          </h2>
          <p className="text-[#555] mb-3 leading-relaxed">
            {COHORT_SIZE} spots. Kevin reads every application and will reach out directly
            if it&apos;s a fit.
          </p>
          <p className="text-sm text-[#777] mb-10">
            Applications close when the cohort is full.
          </p>

          {submitted ? (
            <div className="bg-white border border-[#D4A843] p-8 text-center">
              <p
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Application received.
              </p>
              <p className="text-[#555]">
                Kevin will be in touch. In the meantime, check out{' '}
                <a href="/shirts" className="text-[#D4A843] underline">the shirts</a> and
                start thinking about who you&apos;d invite to sponsor.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">
                    Name <span className="text-[#D4A843]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">
                    Email <span className="text-[#D4A843]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
                    placeholder="you@email.com"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                    className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">School or church</label>
                  <input
                    type="text"
                    value={formData.school}
                    onChange={e => setFormData(p => ({ ...p, school: e.target.value }))}
                    className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
                    placeholder="University, church, or N/A"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">
                  Organization or group
                </label>
                <input
                  type="text"
                  value={formData.organization}
                  onChange={e => setFormData(p => ({ ...p, organization: e.target.value }))}
                  className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
                  placeholder="Campus ministry, Greek org, small group, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">
                  Why do you want to go? <span className="text-[#D4A843]">*</span>
                </label>
                <textarea
                  required
                  minLength={10}
                  rows={4}
                  value={formData.why}
                  onChange={e => setFormData(p => ({ ...p, why: e.target.value }))}
                  className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors resize-none"
                  placeholder="What draws you to this? No wrong answers."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">
                  Who are the first 5 people you&apos;d invite to sponsor? <span className="text-[#D4A843]">*</span>
                </label>
                <textarea
                  required
                  minLength={10}
                  rows={3}
                  value={formData.first_five}
                  onChange={e => setFormData(p => ({ ...p, first_five: e.target.value }))}
                  className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors resize-none"
                  placeholder="First names are fine. We're not contacting them — we want to know you've already thought about this."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">
                  How did you hear about Be A Number?
                </label>
                <input
                  type="text"
                  value={formData.how_heard}
                  onChange={e => setFormData(p => ({ ...p, how_heard: e.target.value }))}
                  className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
                  placeholder="Instagram, a friend, church, etc."
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-4 font-bold uppercase tracking-wider text-sm transition-colors ${
                  submitting
                    ? 'bg-[#D4A843]/70 text-[#0d0d0d] cursor-wait'
                    : 'bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] cursor-pointer'
                }`}
              >
                {submitting ? 'Submitting...' : 'Apply for the Founding Cohort'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Already accepted? Login link */}
      <section className="py-12 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-[#777]">
            Already in the cohort?{' '}
            <a href="/rep/dashboard" className="text-[#D4A843] underline">
              Log in to your dashboard
            </a>
          </p>
        </div>
      </section>

      <BANFooter />
    </div>
  );
}
