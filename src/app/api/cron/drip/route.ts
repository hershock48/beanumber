/**
 * Drip Nurture Cron Job
 *
 * GET /api/cron/drip
 *
 * Runs daily. Finds Donors with DripNextSend <= today and sends the next
 * email in their assigned pipeline. Currently supports:
 *
 *   - shirt_nurture: 4 follow-up emails (emails 2–5) over ~30 days for
 *     shirt-only buyers, nudging them toward monthly sponsorship.
 *
 * Enrollment happens in the Stripe webhook (shirt-only branch). The webhook
 * sets DripPipeline, DripStage=0, DripNextSend, DripChildName, DripShirtNumber.
 * This cron picks it up from there.
 *
 * When a buyer converts to a monthly sponsor (subscription created), the
 * webhook clears the drip fields so they stop receiving nurture emails.
 *
 * Secured by CRON_SECRET (same as other cron endpoints).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

// ── Constants ────────────────────────────────────────────────────────────────

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const DONORS_TABLE = 'tblhuLpJgYLB0pTjx';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

function getHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== 'production';

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7) === cronSecret;

  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === cronSecret;
}

// ── Pipeline configurations ──────────────────────────────────────────────────
//
// shirt_nurture (4 emails, ~34 days):
//   Stage 0 → Day 10: "Did it arrive?" (by now they should have it)
//   Stage 1 → Day 16: "Enter your number"
//   Stage 2 → Day 24: "Here's what happened" + conversion ask
//   Stage 3 → Day 34: "Last one from me" + final nudge
//
// sponsor_onboard (3 emails, ~21 days):
//   Stage 0 → Day 3:  "Here's your portal" — login + meet your child
//   Stage 1 → Day 10: "Your first update is coming" — set expectations
//   Stage 2 → Day 21: "You've been here a month" — celebrate, impact
//
// donor_convert (3 emails, ~25 days):
//   Stage 0 → Day 5:  "Here's what your donation did" — specific impact
//   Stage 1 → Day 14: "Meet the kids" — introduce sponsorship model
//   Stage 2 → Day 25: "Last one from me" — final respectful nudge
//
// shirt_sponsor (4 emails, ~32 days):
//   Stage 0 → Day 10: "Did it arrive?" — arrival check + teases reveal
//   Stage 1 → Day 15: "Meet your child" — how to enter the number on the site
//   Stage 2 → Day 22: "What your first month did" — impact, updates coming
//   Stage 3 → Day 32: "Thank you for staying" — celebrate, tell one friend
//
// monthly_donor (3 emails, ~22 days):
//   Stage 0 → Day 3:  "Thank you for going monthly" — impact, what $X/mo does
//   Stage 1 → Day 12: "Inside the campus" — how it works, meet the kids
//   Stage 2 → Day 22: "Something I want to show you" — gentle intro to sponsorship

type PipelineConfig = { gaps: number[]; maxStages: number };

const PIPELINE_CONFIGS: Record<string, PipelineConfig> = {
  shirt_nurture:    { gaps: [6, 6, 8, 10], maxStages: 4 },
  sponsor_onboard:  { gaps: [3, 7, 11],    maxStages: 3 },
  donor_convert:    { gaps: [5, 9, 11],    maxStages: 3 },
  shirt_sponsor:    { gaps: [3, 5, 7, 10], maxStages: 4 },
  monthly_donor:    { gaps: [3, 9, 10],    maxStages: 3 },
};

type DripDonor = {
  recordId: string;
  email: string;
  firstName: string;
  pipeline: string;
  dripStage: number;
  childName: string;       // may be comma-separated for multi-shirt orders
  shirtNumber: string;     // may be comma-separated for multi-shirt orders
};

// Helpers for multi-shirt handling
function parseShirtNumbers(raw: string): number[] {
  return String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}
function parseChildNames(raw: string): string[] {
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}
function isMultiShirt(donor: DripDonor): boolean {
  return parseShirtNumbers(donor.shirtNumber).length > 1;
}
function multiChildBlock(numbers: number[], names: string[]): string {
  return numbers.map((n, i) => {
    const name = names[i] || '';
    const url = `${SITE_URL}/children/${n}`;
    return name
      ? `<a href="${url}" style="color: #D4A843; font-weight: bold;">#${n} &rarr; ${name}</a>`
      : `<a href="${url}" style="color: #D4A843; font-weight: bold;">#${n}</a>`;
  }).join('<br>');
}

// ── Email templates ──────────────────────────────────────────────────────────

// Shared email wrapper
function wrapEmail(body: string) {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
    ${body}
    <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; line-height: 1.5;">
      Be A Number, International<br>
      <a href="${SITE_URL}" style="color: #D4A843;">beanumber.org</a> &nbsp;&middot;&nbsp;
      <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
    </p>
  </body>
</html>`;
}

function shirtNurtureEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName, shirtNumber } = donor;
  // Stockpile model: never name a specific child or quote a specific
  // shirt number in any of these emails. The buyer-to-child match
  // happens when the buyer reads the number off the back of their
  // shirt and visits beanumber.org/[number] — we don't pre-assign at
  // checkout anymore, so we don't write the match as if we know it.
  // `multi` is still useful for grammar ("your shirts" vs "your shirt"),
  // since the buyer literally has more than one physical shirt — but
  // we don't list the numbers.
  const numbers = parseShirtNumbers(shirtNumber);
  const multi = numbers.length > 1;
  const sponsorUrl = `${SITE_URL}/sponsorship`;

  switch (stage) {
    // ── Email 1: Did it arrive + how to claim (ship + 3 days) ─────────────
    // Lands as a check-in but introduces the full mechanic: number on
    // the back → site → claim. The claim concept is what unlocks the
    // rest of the relationship, so we name it explicitly on the first
    // touch.
    case 0:
      return {
        subject: multi ? "Did your shirts arrive?" : "Did your shirt arrive?",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>You ordered ${numbers.length} shirts and I wanted to check if they made it. I screen-print every one by hand, so they were made specifically for you.</p>
               <p>When they arrive, flip each one over. Every shirt has a different number pressed below the main design, and every number belongs to a different kid at our campus in Northern Uganda. Enter each number at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> to meet the kid behind it.</p>
               <p>You&rsquo;ll have an option to claim each number as yours. When you do, that kid&rsquo;s page becomes your page. Updates from the campus, photos, letters &mdash; all of it comes back to that page. Your browser remembers you on this device, so there&rsquo;s no password to keep track of.</p>`
            : `<p>I wanted to check in and see if your shirt made it. I screen-print every one by hand, so it was made specifically for you.</p>
               <p>When it arrives, flip it over. There&rsquo;s a number pressed below the main design, and that number belongs to a real kid at our campus in Northern Uganda. Go to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter your number, and meet them.</p>
               <p>You&rsquo;ll have an option to claim that number as yours. When you do, that kid&rsquo;s page becomes your page. Updates from the campus, photos, letters &mdash; all of it comes back to that page. Your browser remembers you on this device, so there&rsquo;s no password to keep track of.</p>`
          }
          <p style="text-align: center; margin: 24px 0;">
            <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR ${multi ? 'NUMBERS' : 'NUMBER'}</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: A real campus moment (ship + 9 days) ─────────────────────
    // Previously a generic re-nudge. Now a real story from the school —
    // Teacher Susan's class learning to write — that ties the abstract
    // "your shirt is connected to a kid" to a concrete campus reality.
    // Specific over vague, per voice.md.
    case 1:
      return {
        subject: "Something I want to tell you about",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>We have 65 kids enrolled at our school in Northern Uganda right now, from Nursery up through Primary Five. ${multi ? `The kids your shirts are connected to are` : `The kid your shirt is connected to is`} in there.</p>
          <p>In Teacher Susan&rsquo;s class this past term, every kid in the room started the year unable to write. By the time the term closed, every one of them was writing on their own. That happened because three things stayed in place: fed kids walking in every morning, a teacher who knew her stuff at the front of the room, and chalk and notebooks that didn&rsquo;t run out before the term ended.</p>
          <p>The chalk doesn&rsquo;t show up by itself. Shirt buyers and sponsors here keep it stocked.</p>
          <p>If you haven&rsquo;t yet, this is a good moment to flip ${multi ? `your shirts` : `your shirt`} over, read the ${multi ? `numbers` : `number`} off the back, and go meet ${multi ? `the kids` : `the kid`} at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR ${multi ? 'NUMBERS' : 'NUMBER'}</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: Conversion ask, tied to the claim (ship + 17 days) ───────
    // Assumes by now they&rsquo;ve seen the kid&rsquo;s page. Frames sponsorship
    // as the next step ON TOP of having claimed, not as a standalone ask.
    case 2:
      return {
        subject: multi ? "About the kids behind your shirts" : "About the kid behind your shirt",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>If you&rsquo;ve claimed your numbers by now, you&rsquo;ve seen the kids&rsquo; pages. You know their names, their grades, and what makes each one of them themselves. They&rsquo;re real people.</p>
               <p>Owning the numbers connects you to them. Sponsoring at $25 a month per kid turns that into school fees, two meals a day, and medical care at the campus. The sponsor gets letters, photos, and report cards. The kid knows their sponsor&rsquo;s name.</p>`
            : `<p>If you&rsquo;ve claimed your number by now, you&rsquo;ve seen your kid&rsquo;s page. You know their name, their grade, their family, and what they said when their teacher asked what they want to do. They&rsquo;re a real person.</p>
               <p>Owning the number connects you to them. Sponsoring at $25 a month turns that into school fees, two meals a day, and medical care at the campus. The sponsor gets letters, photos, and report cards. The kid knows their sponsor&rsquo;s name.</p>`
          }
          <p>This is the part where the relationship goes from a number on a shirt to ${multi ? `kids` : `a kid`} you actually know.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">SPONSOR FOR $25/MO</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: Warm close — door stays open (ship + 27 days) ────────────
    // Previously "Last email from me about this" with a flat exit.
    // Reframed: I&rsquo;ll stop showing up, but the relationship continues
    // through the campus newsletter, and once they claim, those updates
    // are about their kid specifically. Future contact has substance,
    // not nudges.
    case 3:
      return {
        subject: "I'll stop showing up after this one",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I&rsquo;ll stop showing up in your inbox after this one.</p>
          <p>The shirt is how you found us. The number is how you met ${multi ? `your kids` : `your kid`}. Sponsorship, if you go that route, is how you stay in their life: school fees, meals, the clinic, plus letters and photos coming back to you. $25 a month, cancel anytime, and you&rsquo;d be welcome.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">START A SPONSORSHIP</a>
          </p>
          <p>From here on out, when you hear from me it&rsquo;ll be the monthly newsletter from the campus. Once you&rsquo;ve claimed ${multi ? `your numbers` : `your number`}, those updates have ${multi ? `your kids` : `your kid`} in them specifically. No more nudges.</p>
          <p>Wear ${multi ? `the shirts` : `the shirt`} with pride.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Sponsor onboard emails ──────────────────────────────────────────────────

function sponsorOnboardEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName, childName, shirtNumber } = donor;
  const numbers = parseShirtNumbers(shirtNumber);
  const names = parseChildNames(childName);
  const firstNumber = numbers[0];
  const firstName_ = names[0] || '';
  // Use first child's page for direct links; sponsor_onboard is always single-sponsor
  const childUrl = firstNumber ? `${SITE_URL}/children/${firstNumber}` : SITE_URL;
  const childUrlLabel = firstNumber ? `beanumber.org/${firstNumber}` : 'beanumber.org';
  // For display, use the parsed first name rather than raw (may be comma-separated)
  const displayChildName = firstName_ || childName;

  switch (stage) {
    // ── Email 1: Your kid's page (Day ~3) ────────────────────────────────
    case 0:
      return {
        subject: "Your sponsorship is active",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your sponsorship is active, and I wanted to make sure you have everything you need to get started.</p>
          ${displayChildName
            ? `<p>Your $25 a month supports school fees, two meals a day, and medical care at the YDO campus where ${displayChildName} goes to school. For a lot of the kids on campus, those meals are the only ones they get all day, so this matters starting right now.</p>`
            : `<p>Your $25 a month supports school fees, two meals a day, and medical care at the YDO campus where your matched child goes to school. For a lot of the kids on campus, those meals are the only ones they get all day, so this matters starting right now.</p>`
          }
          ${firstNumber
            ? `<p><strong>${displayChildName ? `${displayChildName}’s` : 'Your'} page is at <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">${childUrlLabel}</a>.</strong> Bookmark it. That&rsquo;s where updates, photos, and letters from the campus show up. Your browser remembers you after your first visit, so there&rsquo;s no separate login to keep track of.</p>`
            : `<p><strong>Updates, photos, and letters from the campus show up on your kid&rsquo;s page at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>.</strong></p>`
          }
          <p>If you ever want to write to ${displayChildName || 'your child'}, just reply to this email. The YDO team on the ground handles delivery and translation. And if you ever can&rsquo;t get back to your page, write me at <a href="mailto:Kevin@beanumber.org" style="color: #D4A843; font-weight: bold;">Kevin@beanumber.org</a> and I&rsquo;ll sort it out.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: What to expect (Day ~10) ────────────────────────────────
    case 1:
      return {
        subject: "What to expect over the next few weeks",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Just wanted to give you a heads up on what to expect over the next few weeks.</p>
          <p>The YDO team on the ground in Uganda sends regular updates from the campus. ${displayChildName ? `You&rsquo;ll hear about ${displayChildName} specifically` : 'You&rsquo;ll hear about your child specifically'}: what they&rsquo;re studying, how they&rsquo;re doing in class, sometimes a photo or a handwritten letter. Those updates show up on ${displayChildName ? `${displayChildName}&rsquo;s page` : 'your kid&rsquo;s page'} at <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">${childUrlLabel}</a> and by email, and the first one usually comes within your first month.</p>
          <p>If you want to write to ${displayChildName || 'your child'} yourself, go for it. Just reply to any email. The YDO team reads every note, translates when needed, and makes sure it actually gets to them.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: One month (Day ~21) ─────────────────────────────────────
    case 2:
      return {
        subject: "Checking in after your first month",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;ve been sponsoring for about a month now, so I just wanted to check in and let you know what your $25 supported this month: ${displayChildName ? `${displayChildName} went` : 'your child went'} to school every day, ate breakfast and lunch at the campus every day, and had a nurse available whenever they needed one. Same thing will happen next month because you&rsquo;re still here.</p>
          <p>One thing that really helps us grow: if you know someone who&rsquo;d be into what we do, send them a quick text. It doesn&rsquo;t need to be a whole thing, something like &ldquo;I sponsor a kid in Uganda through this org called Be A Number, you should check it out.&rdquo; That&rsquo;s genuinely how most of our sponsors find us.</p>
          <p>${displayChildName ? `${displayChildName}&rsquo;s page` : 'Your kid&rsquo;s page'} at <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">${childUrlLabel}</a> has the latest updates whenever you want to check in.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Donor conversion emails ─────────────────────────────────────────────────

function donorConvertEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName } = donor;
  const sponsorUrl = `${SITE_URL}/sponsorship`;

  switch (stage) {
    // ── Email 1: Where the donation went (Day ~5) ────────────────────────
    case 0:
      return {
        subject: "Following up on your donation",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to follow up and let you know where your donation actually went, because I think that matters.</p>
          <p>It went to the YDO campus in Northern Uganda. One campus, one team on the ground. The budget supports school fees, meals, and medical care for the children there &mdash; you can know any of them by name. We&rsquo;re small on purpose, which means I can tell you exactly where your money ends up.</p>
          <p>Thank you for trusting us with it.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: The sponsorship model (Day ~14) ─────────────────────────
    case 1:
      return {
        subject: "A little more about how we work",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to tell you a little more about how we work, since you already took a chance on us once.</p>
          <p>Every child at our campus has a number, and that number is the bridge to a sponsor. The sponsor pays $25 a month, which supports school, two meals a day, and medical care at the campus. In return, the sponsor gets letters, photos, and report cards from their matched child. The child knows their sponsor&rsquo;s name. It&rsquo;s a real relationship between two real people, and that&rsquo;s kind of the whole point of what we built.</p>
          <p>If you want to see the kids, you can <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">meet them here</a>. Or if you want to grab a shirt and get randomly matched to a child by number, <a href="${SITE_URL}/shirts" style="color: #D4A843; font-weight: bold;">check out the shirts here</a>.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: Warm close — door stays open (Day ~25) ──────────────────
    case 2:
      return {
        subject: "I'll stop showing up after this one",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I&rsquo;ll stop showing up in your inbox after this one.</p>
          <p>What you gave went to real kids. It supported meals, kept them in school, paid for a nurse on the days they needed one. That&rsquo;s where it landed. No overhead games, no admin layer between your gift and the kids who got fed.</p>
          <p>If you ever want to go deeper, sponsoring a child for $25 a month connects you to one specific kid at the campus by name. You get letters, photos, and report cards from them. Or grab a shirt at <a href="${SITE_URL}/shirts" style="color: #D4A843; font-weight: bold;">beanumber.org/shirts</a> and the number on the back is your match.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">BROWSE THE KIDS</a>
          </p>
          <p>From here on out, when you hear from me it&rsquo;ll be the monthly newsletter from the campus. Thank you again.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Shirt + sponsor combo emails ────────────────────────────────────────────

function shirtSponsorEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName, shirtNumber } = donor;
  // Stockpile model: never name a specific child or quote a specific
  // shirt number. Buyer-to-child match happens when the buyer reads
  // the number off the back of their shirt and visits beanumber.org/
  // [number]. We don't pre-assign at checkout anymore, so we don't
  // write the match as if we know it. `multi` is kept for grammar
  // ("your shirts" vs "your shirt"), since the buyer literally has
  // more than one physical shirt — but we don't list the numbers.
  const numbers = parseShirtNumbers(shirtNumber);
  const multi = numbers.length > 1;

  switch (stage) {
    // ── Email 1: Shirt in transit + sponsorship active, NO reveal (Day ~10)
    case 0:
      return {
        subject: multi ? "Your shirts are being made right now" : "Your shirt is being made right now",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>Your ${numbers.length} shirts are being made right now. I screen-print every one by hand, and yours will ship within the next few days.</p>
               <p>When they arrive, check the back of each one. Every shirt has a different number pressed below the main design, and every number belongs to a different child at our campus in Northern Uganda. You&rsquo;ll come back to the site, enter each number, and meet them.</p>`
            : `<p>Your shirt is being made right now. I screen-print every one by hand, and yours will ship within the next few days.</p>
               <p>When it arrives, check the back of the shirt. There&rsquo;s a number pressed below the main design, and that number belongs to a real child at our campus in Northern Uganda. You&rsquo;ll come back to the site, enter the number, and meet them.</p>`
          }
          <p>You also signed up for monthly sponsorship, which means your $25 a month is already at work. It supports school fees, two meals a day, and medical care at the campus, and that started the day you signed up. You&rsquo;re a sponsor right now, even before the ${multi ? 'shirts arrive' : 'shirt arrives'}.</p>
          <p>Once you&rsquo;ve gotten your ${multi ? 'shirts' : 'shirt'} and entered the number on the site, your sponsor view unlocks right on that page &mdash; updates, photos, the whole thing. I want you to have the ${multi ? 'shirts' : 'shirt'} in hand first.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: Meet the kid + how to get into the sponsor view (Day ~13)
    //
    // No personalization, no sponsor code. The buyer's shirt has the
    // number; entering it on the site is what unlocks their sponsor
    // view. Their browser remembers them after that. No code to keep.
    case 1: {
      return {
        subject: multi ? "Have you met your kids yet?" : "Have you met your child yet?",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>Your shirts should be there by now. Each one has a different number pressed on the back, and each number belongs to a different child at the campus. Enter each number at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> to meet the kid behind it.</p>
               <p>Your sponsorship is already supporting school fees, meals, and medical care for the children at the campus.</p>`
            : `<p>Your shirt should be there by now, and if it is, you&rsquo;ve seen the number on the back. That number is your kid. Enter it at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> to meet them.</p>
               <p>Your sponsorship is already supporting school fees, meals, and medical care at the campus.</p>`
          }
          <p>When you enter your number, your sponsor view unlocks right on that page: updates, photos, and the gear with your number on it. Your browser remembers you after that, so there's no separate login to keep track of.</p>
          <p>Kevin</p>
        `),
      };
    }

    // ── Email 3: Two weeks in (Day ~18) ──────────────────────────────────
    case 2:
      return {
        subject: "Two weeks as a sponsor",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;ve been sponsoring for about two weeks now, and I wanted to give you a picture of what that looks like on the ground.</p>
          <p>Your $25 this month went toward school fees, breakfast and lunch every day, and a nurse on campus whenever the kids needed one. That&rsquo;s what sponsorship looks like in practice, and it happens every month you&rsquo;re here.</p>
          <p>Your first update from the campus should be coming soon. The YDO team sends photos, report cards, and sometimes handwritten letters from the kids, and they show up on your kid's page at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> and by email.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: One month (Day ~25) ─────────────────────────────────────
    case 3:
      return {
        subject: "One month in",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You bought ${multi ? `${numbers.length} shirts` : 'a shirt'} and signed up to sponsor in the same decision, and that decision has been supporting school fees, meals, and medical care for a full month now.</p>
          <p>If you know someone who&rsquo;d be into what we do, the best thing you can do is send them a text. Doesn&rsquo;t need to be a big deal, something like &ldquo;I sponsor a kid in Uganda through Be A Number, you should check it out.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
          <p>Your kid's page has the latest updates whenever you want to check in.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Monthly donor emails (not a sponsor, gave monthly via donate page) ──────

function monthlyDonorEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName } = donor;

  switch (stage) {
    // ── Email 1: Where the monthly gift goes (Day ~3) ────────────────────
    case 0:
      return {
        subject: "Where your monthly donation goes",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to reach out and let you know where your monthly donation goes.</p>
          <p>It goes to the YDO campus in Northern Uganda. One campus, one team on the ground. We built a school for 380 kids, a medical clinic that has treated more than 700 patients, and vocational programs where 60 women are learning trades. Your gift each month supports meals for kids who might not eat otherwise, school fees that keep them in class, and a medical clinic that serves the whole community.</p>
          <p>I&rsquo;ll keep you in the loop on what&rsquo;s happening at the campus.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: How it works (Day ~12) ──────────────────────────────────
    case 1:
      return {
        subject: "How things work at the campus",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to give you a better picture of how things work on the ground, since your monthly gift is part of what makes it all run.</p>
          <p>Every child at the campus has a number, and that number goes on a shirt. When someone buys that shirt or sponsors that child, they get connected to a real kid by name. The sponsor gets letters, photos, and report cards, and the child knows their sponsor. It&rsquo;s not a big faceless program.</p>
          <p>Your monthly gift is what keeps the whole campus going: the meals, the teachers, the clinic. Without monthly donors, none of the rest of it would work.</p>
          <p>If you want to see the kids your gift is supporting, you can <a href="${SITE_URL}/sponsorship" style="color: #D4A843; font-weight: bold;">meet them here</a>.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: Soft upgrade ask + warm close (Day ~22) ─────────────────
    // Previously a pure word-of-mouth ask, which is a fine sentiment
    // but the wrong final beat for a monthly donor we&rsquo;d ideally
    // upgrade to a named sponsorship. Reframed as an invitation to
    // add the relationship piece, with a graceful out if monthly is
    // already the right shape.
    case 2:
      return {
        subject: "One more thing I want to put in front of you",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your monthly gift keeps the campus running, and I&rsquo;m thankful for it. One more thing I want to mention, then I&rsquo;ll let you go.</p>
          <p>Sponsorship is the other side of how people give to us. $25 a month connects you to one specific kid at the campus by name. The kid knows yours. You get letters, photos, and report cards from them. Same campus, same kids, plus a real relationship with one of them by name.</p>
          <p>If you ever want to add that piece, you can browse the kids at <a href="${SITE_URL}/sponsorship" style="color: #D4A843; font-weight: bold;">beanumber.org/sponsorship</a>. No pressure if monthly giving is the right shape for you &mdash; what you&rsquo;re already giving keeps a lot of lights on.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${SITE_URL}/sponsorship" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
          </p>
          <p>From here on out, when you hear from me it&rsquo;ll be the monthly newsletter from the campus. Thank you for being part of this.</p>
          <p>God bless,<br>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Pipeline router ─────────────────────────────────────────────────────────

function getEmailForPipeline(
  pipeline: string,
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  switch (pipeline) {
    case 'shirt_nurture':    return shirtNurtureEmail(stage, donor);
    case 'sponsor_onboard':  return sponsorOnboardEmail(stage, donor);
    case 'donor_convert':    return donorConvertEmail(stage, donor);
    case 'shirt_sponsor':    return shirtSponsorEmail(stage, donor);
    case 'monthly_donor':    return monthlyDonorEmail(stage, donor);
    default:                 return null;
  }
}

// ── Airtable helpers ─────────────────────────────────────────────────────────

async function getDripDonorsDue(): Promise<DripDonor[]> {
  // Query ALL pipelines — not just shirt_nurture
  const formula = `AND(
    NOT({DripPipeline}=BLANK()),
    NOT({DripNextSend}=BLANK()),
    IS_BEFORE({DripNextSend}, DATEADD(TODAY(), 1, 'day'))
  )`;

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=50`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    console.error('[Drip] Failed to query donors:', res.status);
    return [];
  }

  const data = await res.json();
  return (data.records || []).map((r: any) => ({
    recordId: r.id,
    email: r.fields['Email Address'] || '',
    firstName: (r.fields['Donor Name'] || '').split(' ')[0] || 'there',
    pipeline: r.fields['DripPipeline'] || '',
    dripStage: r.fields['DripStage'] ?? 0,
    childName: r.fields['DripChildName'] || '',
    shirtNumber: r.fields['DripShirtNumber'] || '',
  }));
}

async function advanceDripStage(
  recordId: string,
  newStage: number,
  nextSendDate: string | null
): Promise<void> {
  const fields: Record<string, unknown> = { DripStage: newStage };

  if (nextSendDate) {
    fields.DripNextSend = nextSendDate;
  } else {
    // Sequence complete — clear drip fields
    fields.DripPipeline = null;
    fields.DripStage = null;
    fields.DripNextSend = null;
    // Keep DripChildName and DripShirtNumber for analytics
  }

  await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DONORS_TABLE}/${recordId}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ fields }),
    }
  );
}

// Log to Communications table for audit trail
async function logDripSend(
  donorId: string,
  email: string,
  subject: string,
  pipeline: string,
  stage: number,
  maxStages: number,
  status: string
): Promise<void> {
  try {
    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/tblw7ZmsfcphmfsWT`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          fields: {
            Subject: subject,
            'Email Body': `[Drip] Pipeline: ${pipeline}, Stage: ${stage + 1} of ${maxStages}`,
            'Send Date': new Date().toISOString().split('T')[0],
            Status: status,
            'Recipient Email': email,
            'Email Type': 'Monthly Update', // Closest existing option
            'Related Donor': [donorId],
          },
        }),
      }
    );
  } catch (err) {
    console.error('[Drip] Failed to log communication:', err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`[Drip] Cron started: ${today}`);

  const donors = await getDripDonorsDue();
  console.log(`[Drip] ${donors.length} donor(s) due for drip email`);

  if (donors.length === 0) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  const results: Array<{
    email: string;
    stage: number;
    status: string;
  }> = [];

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  for (const donor of donors) {
    const config = PIPELINE_CONFIGS[donor.pipeline];
    if (!config) {
      console.warn(`[Drip] Unknown pipeline "${donor.pipeline}" for ${donor.email}, skipping`);
      continue;
    }

    const emailContent = getEmailForPipeline(donor.pipeline, donor.dripStage, donor);

    if (!emailContent) {
      // Past the last stage — clear drip
      await advanceDripStage(donor.recordId, donor.dripStage, null);
      results.push({ email: donor.email, stage: donor.dripStage, status: 'completed' });
      continue;
    }

    try {
      const result = await sendEmail({
        to: { email: donor.email, name: donor.firstName },
        from: { email: fromEmail, name: 'Kevin at Be A Number' },
        subject: emailContent.subject,
        html: emailContent.html,
      });

      const newStage = donor.dripStage + 1;
      const gap = config.gaps[donor.dripStage];
      const nextSend = newStage < config.maxStages ? addDays(today, gap ?? 7) : null;

      await advanceDripStage(donor.recordId, newStage, nextSend);
      await logDripSend(
        donor.recordId,
        donor.email,
        emailContent.subject,
        donor.pipeline,
        donor.dripStage,
        config.maxStages,
        result.success ? 'Sent' : 'Failed'
      );

      results.push({
        email: donor.email,
        stage: donor.dripStage,
        status: result.success ? 'sent' : 'failed',
      });

      console.log(
        `[Drip] ${result.success ? 'Sent' : 'FAILED'} ${donor.pipeline} stage ${donor.dripStage + 1}/${config.maxStages} to ${donor.email}`
      );
    } catch (err: any) {
      console.error(`[Drip] Error processing ${donor.email}:`, err?.message || err);
      results.push({ email: donor.email, stage: donor.dripStage, status: 'error' });
    }
  }

  console.log(`[Drip] Cron complete. Processed ${results.length} donor(s).`);

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
