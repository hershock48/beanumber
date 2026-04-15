import Link from 'next/link';
import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

export const metadata: Metadata = {
  title: "Our Story | Be A Number",
  description: "When the war in Northern Uganda ended, most organizations left. Kevin and Simon stayed. This is the story of how they built something that lasts.",
  openGraph: {
    title: "Our Story | Be A Number",
    description: "Two people. Two countries. One mission: rebuild what the war broke.",
    images: ["/images/founder/hero-sewing-classroom.jpg"],
  },
};

export default function Founder() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/founder" />

      <main className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-16 text-center">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">The Story</p>
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              When the war ended,<br />everyone left.
            </h1>
            <p className="text-lg text-[#777] max-w-lg mx-auto leading-relaxed">
              Two people stayed. This is what they built.
            </p>
            <div className="w-8 h-px bg-[#D4A843] mx-auto mt-10" />
          </div>

          {/* The War */}
          <div className="space-y-6 mb-16">
            <p className="text-[#555] leading-relaxed text-lg">
              For over two decades, Northern Uganda endured one of the longest and most brutal conflicts in African history. The Lord&rsquo;s Resistance Army abducted tens of thousands of children, displaced nearly two million people, and dismantled the social fabric of the Acholi people. Schools were destroyed and families were scattered into displacement camps, where entire communities lived for years with almost nothing.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              During the war, international attention poured in. NGOs set up operations and donor money flowed. But when the guns went quiet and the conflict wound down in the late 2000s, most of that attention left with it. Organizations packed up, funding dried up, and the cameras moved on to the next crisis.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              What remained were communities trying to rebuild from nothing, with almost no one still standing beside them.
            </p>
          </div>

          {/* Kevin */}
          <div className="space-y-6 mb-16">
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Kevin C. Hershock
            </h2>
            <p className="text-sm text-[#999] uppercase tracking-wider mb-6">Founder &amp; Executive Director, Be A Number &nbsp;&middot;&nbsp; United States</p>

            <p className="text-[#555] leading-relaxed text-lg">
              Kevin started Be A Number in 2010, as a college project. He loved what TOMS Shoes was doing with their buy-one-give-one model, but he wanted the connection to go deeper. A purchase shouldn&rsquo;t just fund a charitable act somewhere in the world. It should link you, specifically, to a person whose story you could actually follow.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              The model was simple. Each shirt was numbered, and each number was linked to a place where he&rsquo;d given a shirt away: a homeless shelter in Detroit, Pine Ridge, the Dominican Republic. You could look up your number and see who was on the other side of it. He spent those years traveling, handing shirts out, meeting people in the poorest parts of the hemisphere. It was joyful work, and it worked. But he wanted the connection to go deeper still.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              After college, with his family going through a hard stretch and his sense of calling shifting, Kevin spent long hours praying at a cemetery near home, trying to figure out what his life was supposed to look like. What came out of that season was a decision to go to Africa.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              In 2011 he flew to Northern Uganda alone, following an invitation from two Kenyan missionaries opening a school in the post-war zone. The plan was to extend the shirt model: numbers linked to children in their school, a shirt sold in America sending a child to class in Uganda. A month in, the American partner pulled out of the arrangement. Kevin fasted for the first time in his life, prayed, and stayed.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              Something crystallized in him then. If he was going to handle other people&rsquo;s money to help children, he didn&rsquo;t ever want to depend on someone else&rsquo;s institution to do it.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              He had already met a group of women near where he was living. They were Congolese, married off to Ugandan soldiers, given children by them, and then abandoned. The only way they had to feed those children was sex work. They had decided to walk away from it, even at real financial cost, because of their faith. Kevin&rsquo;s response was Magdalene&rsquo;s Bakery: a small business that taught them to bake and sell cupcakes and bread. Over five years it grew into a full sit-down restaurant that employed not just the original women but refugees from across the war-affected region.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              Magdalene&rsquo;s eventually wound down, and the years after were a series of experiments. How does someone actually get out of poverty? What&rsquo;s the right balance between business and charity? Kevin tried microloans. He tried unconditional giving. He worked with different partners, watched what held and what didn&rsquo;t.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              The answer, eventually, was the model you&rsquo;re looking at now: not another American organization running programs in an African community, but an Acholi man on Acholi land, doing the work his own team designs.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              Fifteen years after that first arrangement fell through, Be A Number runs its own school on its own campus, and the original idea, a numbered shirt linked to a specific child&rsquo;s tuition, is finally what it was meant to be. Kevin came back to the plan he arrived with in 2011. The ground is Simon&rsquo;s.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              Kevin lives in Michigan with his three children: Eloise, Magdalen, and Leo.
            </p>
          </div>

          {/* Simon */}
          <div className="space-y-6 mb-16">
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Simon Peter Wilobo
            </h2>
            <p className="text-sm text-[#999] uppercase tracking-wider mb-6">Founder &amp; Head of YDO &nbsp;&middot;&nbsp; Omoro District, Northern Uganda</p>

            <p className="text-[#555] leading-relaxed text-lg">
              Simon is Acholi. He grew up in Northern Uganda during the LRA conflict, in the same generation whose childhoods the war swallowed, the same years tens of thousands of Acholi children were abducted and turned into soldiers. The rest of the world eventually stopped watching. Simon didn&rsquo;t have that option; this was home. He came out the other side determined to rebuild what had been broken, not through an outside organization but from within his own community.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              He founded Youth Development Organisation Uganda (YDO) in Omoro District on a single conviction: lasting recovery has to come from within. Today Simon leads a team of 30 local staff and volunteers who design and run every program based on what the community actually needs, not what a donor report looks like.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              His history isn&rsquo;t theoretical, and that&rsquo;s what makes YDO different from an organization that flies in, runs a program, and leaves. Simon&rsquo;s team doesn&rsquo;t work in the community so much as they are the community, and the programs they build are designed to outlast any external support.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              Simon and his wife are in Bible college together, studying while running YDO.
            </p>
          </div>

          {/* Together */}
          <div className="space-y-6 mb-16">
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              What they built together
            </h2>

            <p className="text-[#555] leading-relaxed text-lg">
              Together, they secured six acres in Omoro District. The land is Acholi. It&rsquo;s Simon&rsquo;s. The campus is not an outside organization&rsquo;s outpost. It is the community&rsquo;s own ground.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              On those six acres they built a nursery and primary school serving 380 students, a medical center, vocational training facilities where 60 women learn marketable trades, construction apprenticeship programs, and an international lodge for visiting sponsors and university cohorts.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              Thirty people from the community are employed to run it. Simon&rsquo;s team implements every program while Kevin built the systems that fund it and the bridge that connects American sponsors to Ugandan children. Neither half works without the other.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              In 2025, more than 700 patients received medical care, 68 adults completed vocational and construction training, and over 60 youth joined sports and wellness programs. The organization raised and deployed $79,623, with 96.7% going directly to programs and almost nothing lost to overhead.
            </p>
          </div>

          {/* The Gap */}
          <div className="space-y-6 mb-16">
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              The gap nobody talks about
            </h2>

            <p className="text-[#555] leading-relaxed text-lg">
              When there&rsquo;s a war, money shows up. When the war ends, money leaves. The rebuilding (the schools, the clinics, the job training, the trauma recovery) takes decades, not news cycles. And it&rsquo;s the part that almost never gets funded.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              Be A Number exists in that gap, not as a crisis-response organization but as a long-term partner to a community doing the slow, unfilmed work of rebuilding after everyone else went home.
            </p>

            <p className="text-[#555] leading-relaxed text-lg">
              The shirts, the numbers, the sponsorship model: all of it exists to keep that bridge open and give people in the U.S. a tangible, personal connection to a child whose community is still recovering from a war most Americans have never heard of.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center py-10">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/shirts"
                className="px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
              >
                Get a Shirt
              </Link>
              <Link
                href="/impact"
                className="px-8 py-4 bg-transparent text-[#0d0d0d] font-bold uppercase tracking-wider text-sm border border-[#e8e0d4] hover:border-[#D4A843]/50 transition-colors"
              >
                See the Impact
              </Link>
            </div>
          </div>

        </div>
      </main>

      <BANFooter />
    </div>
  );
}
