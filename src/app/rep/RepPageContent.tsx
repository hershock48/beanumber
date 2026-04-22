'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

const SPONSOR_GOAL = 20;
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
      <section className="relative">
        <div className="relative w-full h-[50vh] min-h-[400px] bg-[#0d0d0d]">
          <Image
            src="/images/impact-page/secondary-image.jpg"
            alt="Kevin carrying water with children on the path to the YDO campus"
            fill
            className="object-cover opacity-60"
            priority
          />
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div className="max-w-3xl text-center">
              <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
                Ambassador Program
              </p>
              <h1
                className="text-4xl md:text-5xl lg:text-6xl text-white mb-6"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Build a team.<br />Go meet the kids.
              </h1>
              <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
                There are kids in Northern Uganda who need sponsors. You have people in your
                life who would show up if someone they trust asked them to. Be the person
                who connects the two, and then go meet the kids yourself.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-5">
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
                When you&apos;re approved, you get a personal referral link and a content kit
                with everything you need to share BAN with your people. You&apos;re also assigned
                your own child at the campus, but the trip isn&apos;t about meeting one kid. Every
                sponsor your team brings in is connected to a child, and you&apos;ll meet all
                of them. Every shirt sold through your link is tracked automatically.
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
                Share your link with your people. When someone grabs a shirt and opts
                into monthly sponsorship, that person is on your team. Your dashboard
                tracks your progress in real time, and you can see where your school
                stands against other schools on the leaderboard.
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
                {' '}{TRIP_LENGTH} in Northern Uganda. You walk onto the YDO campus and the kids
                already know your name because Kevin told them you were coming. You sit in
                their classrooms, eat meals together, play football on the same pitch they
                play on every day. You see what your team built, in person, with the children
                standing right in front of you.
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
              src="/images/story/kids-hugging.png"
              alt="Children at the YDO campus"
              fill
              className="object-cover"
            />
          </div>
          <div className="relative aspect-[4/3] bg-[#f5f0e8] overflow-hidden">
            <Image
              src="/images/impact-page/lead-image-kevin.png"
              alt="Kevin with a mother and child in Northern Uganda"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* The goal */}
      <section className="py-16 px-5 border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-8">
            The goal
          </p>

          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10">
            <h3
              className="text-2xl text-[#0d0d0d] mb-6"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {SPONSOR_GOAL} monthly sponsors
            </h3>

            <div className="space-y-4 text-[#555] leading-relaxed">
              <p>
                Every monthly sponsor you bring in is matched to a real child at the YDO
                campus. Their sponsorship covers that child&apos;s education, daily meals, and
                medical care through the on-site clinic. It&apos;s not a donation into a
                general fund. It&apos;s a name.
              </p>
              <p>
                Get {SPONSOR_GOAL} people from your network sponsoring monthly, keep them
                active for at least three months, and your trip is fully covered. Flights,
                housing, meals, transport. {TRIP_LENGTH} at the campus in Northern Uganda,
                meeting the children your team is keeping in school.
              </p>
              <p>
                The trip isn&apos;t the point. The point is {SPONSOR_GOAL} kids with sponsors
                who showed up because you told them about BAN. The trip is what happens after.
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
              People who are tired of hearing about causes and want to actually know a child
              by name. Campus ministry groups looking for something that lasts longer than a
              week-long trip. Greek life philanthropy chairs who want their chapter behind
              something real. Social work and global studies students who want to see the
              field, not read about it. Church groups who want their faith to show up in
              a specific place for specific people.
            </p>
            <p>
              You don&apos;t have to be in college. If you have people in your life who would
              care about this if you brought it to them, this is for you.
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
                desc: 'A child at the YDO campus assigned to you, plus a connection to every child your team sponsors. The trip is about all of them.',
              },
              {
                title: 'Personal referral link',
                desc: 'Every sale through your link is automatically tracked. No spreadsheets, no manual counting.',
              },
              {
                title: 'Rep dashboard',
                desc: 'Real-time view of your progress toward the trip. See where your school ranks against other schools on the leaderboard.',
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

      {/* Photo before form */}
      <section className="px-5 pb-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full aspect-[21/9] bg-[#f5f0e8] overflow-hidden">
            <Image
              src="/images/homepage/hero-community-group.jpg"
              alt="Community members gathered at the YDO campus"
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
