'use client';

import { useState } from 'react';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

const SPONSOR_GOAL = 15;
const TRIP_COST = '$5,000';
const TRIP_LENGTH = '2 weeks';

export default function RepPageContent() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    school: '',
    organization: '',
    why: '',
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
      <section className="py-16 md:py-28 px-5">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
            Ambassador Program
          </p>
          <h1
            className="text-4xl md:text-5xl lg:text-6xl text-[#0d0d0d] mb-6"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Build a team.<br />Go meet the kids.
          </h1>
          <p className="text-lg md:text-xl text-[#555] max-w-2xl mx-auto leading-relaxed">
            You don&apos;t ask people for money. You sell them a shirt. The shirt connects them
            to a real child. And when enough of your people are in, you fly to Northern Uganda
            and meet the kids your team supports.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            How it works
          </p>

          <div className="space-y-12">
            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                1. Apply
              </h3>
              <p className="text-[#555] leading-relaxed">
                Fill out the form below. Kevin reviews every application personally
                and wants to know who&apos;s representing BAN and why it matters to them.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                2. Get your number
              </h3>
              <p className="text-[#555] leading-relaxed">
                When you&apos;re approved, you&apos;re assigned a child. That&apos;s the child
                you&apos;ll meet on the trip. You get a personal referral link and a content kit
                with everything you need to share BAN with your people. Every shirt sold through
                your link is tracked automatically.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                3. Build your team
              </h3>
              <p className="text-[#555] leading-relaxed">
                Share your link. Sell shirts. The real goal isn&apos;t moving inventory,
                though. When someone buys a shirt and opts into the $25/month sponsorship,
                that person is on your team. Your dashboard shows your progress in real time,
                and you can see where you stand against other reps.
              </p>
            </div>

            <div>
              <h3
                className="text-xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                4. Go meet the kids
              </h3>
              <p className="text-[#555] leading-relaxed">
                {SPONSOR_GOAL} monthly sponsors from your network and your trip is fully covered.
                {' '}{TRIP_LENGTH} in Northern Uganda. You stay at the YDO campus, meet the children,
                see the classrooms, eat the meals, walk the grounds. You meet the child whose
                number you&apos;ve been carrying.
              </p>
            </div>
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
            <h3
              className="text-2xl text-[#0d0d0d] mb-6"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {SPONSOR_GOAL} sponsors = free trip
            </h3>

            <div className="space-y-4 text-[#555] leading-relaxed">
              <p>
                Each shirt is $25. When a buyer opts into monthly sponsorship, that&apos;s $25/month
                going directly to a child&apos;s education, meals, and medical care at the YDO campus.
              </p>
              <p>
                {SPONSOR_GOAL} monthly sponsors from your network means ${SPONSOR_GOAL * 25 * 12}/year
                in recurring support for the campus. That covers your trip cost ({TRIP_COST})
                and keeps funding education, meals, and medical care for the children long after
                you&apos;ve come home.
              </p>
              <p>
                You&apos;re not earning a reward. The sponsorships your team creates keep
                children in school year after year, and the trip is how you see that firsthand.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who this is for */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            Who this is for
          </p>

          <div className="space-y-4 text-[#555] leading-relaxed">
            <p>
              College students who want their time to actually count for something specific.
              Campus ministry groups looking for a mission that lasts longer than a week-long
              trip. Greek life philanthropy chairs who want a cause their chapter can rally
              around. Social work and global studies students who want field experience. Church
              groups who want their giving to land on specific names.
            </p>
            <p>
              Also: anyone who isn&apos;t in college. If you have a network, a church, a gym,
              a workplace, or a friend group and you want to build a sponsorship team and go
              meet the kids, this is for you.
            </p>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            What you get
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Your own number',
                desc: 'A child at the YDO campus assigned to you. The child you\'ll meet on the trip.',
              },
              {
                title: 'Personal referral link',
                desc: 'Every sale through your link is automatically tracked. No spreadsheets, no manual counting.',
              },
              {
                title: 'Rep dashboard',
                desc: 'Real-time view of your shirts sold, monthly sponsors signed up, and progress toward the trip. Plus the cohort leaderboard.',
              },
              {
                title: 'Content kit',
                desc: 'Instagram stories, share graphics, suggested captions. Everything you need to tell people about BAN without writing copy from scratch.',
              },
              {
                title: 'Direct line to Kevin',
                desc: 'You\'re not a number in a system. Kevin knows who you are and is available when you need him.',
              },
              {
                title: 'The trip',
                desc: `${TRIP_LENGTH} at the YDO campus in Northern Uganda. Flights, housing, meals, and transport are fully covered when you hit ${SPONSOR_GOAL} sponsors.`,
              },
            ].map((item) => (
              <div key={item.title} className="bg-white border border-[#e8e0d4] p-6">
                <h4
                  className="text-base text-[#0d0d0d] mb-2"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  {item.title}
                </h4>
                <p className="text-sm text-[#555] leading-relaxed">{item.desc}</p>
              </div>
            ))}
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
            Be a rep
          </h2>
          <p className="text-[#555] mb-10 leading-relaxed">
            Kevin reads every application. If it&apos;s a fit, he&apos;ll reach out directly
            to get you set up.
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
                start thinking about who you&apos;d share them with.
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
                    placeholder="you@school.edu"
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
                  <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">School</label>
                  <input
                    type="text"
                    value={formData.school}
                    onChange={e => setFormData(p => ({ ...p, school: e.target.value }))}
                    className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors"
                    placeholder="University, college, or N/A"
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
                  placeholder="Campus ministry, Greek org, church group, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0d0d0d] mb-2">
                  Why do you want to be a rep? <span className="text-[#D4A843]">*</span>
                </label>
                <textarea
                  required
                  minLength={10}
                  rows={4}
                  value={formData.why}
                  onChange={e => setFormData(p => ({ ...p, why: e.target.value }))}
                  className="w-full border border-[#e8e0d4] bg-white px-4 py-3 text-[#0d0d0d] text-sm focus:outline-none focus:border-[#D4A843] transition-colors resize-none"
                  placeholder="Tell Kevin why this resonates with you. No wrong answers."
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
                  placeholder="Instagram, a friend, campus event, etc."
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
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Already a rep? Login link */}
      <section className="py-12 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-[#777]">
            Already a rep?{' '}
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
