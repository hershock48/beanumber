# Funding model

> Read this before writing customer-facing copy, receipt logic, or anything that touches the donor-to-child relationship. This is the architectural truth that several earlier strategy docs and AI-generated memos missed because it wasn't written down.

## The model in one paragraph

Be A Number operates a **pool-funded program with narrative matching**. Every donation — shirt purchase, monthly sponsorship, gift, annual — flows into the general operating budget of the YDO campus in Omoro District, Northern Uganda. That budget funds the school, the clinic, the meals program, the vocational training, the campus staff, and the children's care year-round. Individual donors are matched to individual children for relationship and storytelling purposes: the child whose number the donor receives becomes their personal connection point — the source of their photos, their updates, their letters, the kid they ask after.

This is the same model Compassion International and World Vision operate on. Strict 1:1 financial allocation is operationally untenable for a campus with 30+ employees, a 6-acre footprint, a school, a clinic, and a vocational training program — annual operating cost vastly exceeds what one donor's $25/month could literally cover for one child's full needs.

## Why this matters for the code and the copy

Three consequences ripple through every customer-facing surface.

**The relationship language is honest, the financial-allocation language is not.** "Your matched child" — true. "Your $25 covers Grace's school fees this month" — false, because Grace's school fees are paid out of the campus budget, not earmarked to her by donor. The first framing is what we write; the second is what we never write.

**There is no fixed roster of un-sponsored kids being depleted.** Multiple donors can be matched to the same child, and operationally that's fine. What matters is that each donor experiences a clear, named, individual relationship with their matched child. This is why "Sponsor a second child" (Memo §4B) has no supply constraint and why we don't need to worry about running out of matchable kids at growth.

**Restricted gifts are the exception, not the default.** Unrestricted general support is the default. Restricted gifts exist for explicit major-donor and project-specific designations — Founder's Series tied to a specific capital project (clinic equipment, vocational expansion), named scholarships, vocational program restricted gifts. When a donor's gift is restricted, the org has a legal obligation to honor that restriction under 501(c)(3) accounting. Don't trigger restriction language casually.

## Verb hygiene for customer-facing copy

The verb you pick communicates whether the gift is restricted or unrestricted. Use the right one.

**Use these verbs** ("supports the pool that supports the child"):

- supports
- helps
- goes toward
- is the kind of thing that pays for

**Avoid these verbs** (they imply restricted 1:1 allocation):

- covers ("Your $25 covers Grace's school fees")
- funds ("This hat funds meals for Grace's classroom")
- pays for [child]'s [thing] ("pays for Joseph's books")

The narrative association is fine — "Your hat supports meals for Grace's classroom" lets the donor visualize where their money is doing work without making it a contractual restriction on the funds. The legal posture stays clean.

**Example rewrites:**

| Old | New |
|---|---|
| "Your $25 covers the shirt and their first month of school, meals, and medical care." | "Your $25 supports the campus where [child] attends school, gets meals, and receives medical care." |
| "This hat funds meals for Grace's classroom." | "This hat supports meals for the campus this month." |
| "$50/month pays for Joseph's school." | "$50/month supports Joseph's school year alongside his classmates." |

## When a donor asks "how is the money actually spent?"

This will happen — a thoughtful donor or a journalist will ask. The honest answer is what's on this page: all gifts flow to the campus operating budget, which funds the school, the clinic, meals, mentorship, vocational training, and staff for every child on campus. Each donor is matched to a specific child so they have someone real to know and root for. We don't divide the budget into per-child slices because the campus doesn't operate that way; the school day, the meal, the doctor's visit, the teacher's salary serve the whole campus.

A short public-facing version of this lives on `/governance` (Memo §0 recommendation; landing in Sprint 2).

## When a restricted gift IS appropriate

Three product paths are designed to accept restricted gifts:

1. **Founder's Series shirt** (Memo §4B). If Kevin designates Founder's Series proceeds to a specific capital project, those gifts are restricted to that project. The donor gets a written acknowledgment that names the restriction.

2. **Named scholarships** (not yet built). A major donor sponsoring a specific child's full year explicitly — typically $1,000+ — can be set up as a restricted gift to that child's school costs.

3. **Project-specific gifts on /donate** (Memo §4B). The vocational program, the clinic, construction apprenticeships — each can be a restricted designation for donors who connect to that specific narrative.

For each of these, the receipt language and the Airtable Donations record must reflect the restriction. Don't accept a restricted gift and treat it as unrestricted; that's a fiduciary breach.

## Tax mechanics (cross-reference Memo §8)

Pool-funding model + quid-pro-quo treatment of physical goods means receipt logic has to handle two axes:

- **Restricted vs unrestricted** (this doc). Most gifts are unrestricted; restricted gifts have explicit acknowledgment of the restriction.
- **Quid-pro-quo split** (Memo §8). Every shirt sale is a donation in exchange for goods: the donor's deduction is the gift minus FMV of the shirt. Three IRS thresholds shape the receipt: under $75 (FMV note for itemizers), $75–$250 (IRC §6115 disclosure), $250+ (IRC §170(f)(8) contemporaneous written acknowledgment).

A clean receipt explicitly names both: "Your $300 annual sponsorship is an unrestricted gift to Be A Number, International (EIN 93-1948872). No goods or services were exchanged. Tax-deductible to the extent allowed by law."

## Where this gets tested

- **Customer-facing copy** — every page on beanumber.org. Verb-hygiene linting (Sprint 1) catches the obvious violations.
- **Receipt templates** in `src/lib/email.ts` — currently overclaim what $25 covers; rewrite in Sprint 5.
- **Sponsor portal copy** — "your child's $X" framings need the same hygiene pass.
- **Newsletter and drip content** — same.
- **Sales copy in the shirt product cards** — flagship currently says "Your $25 gets you the shirt and sponsors a child for your first month." Acceptable today; the Sprint 1 verb pass cleans up the more egregious cases.

## Related docs

- `voice.md` — broader voice rules; this doc is the legal layer that voice.md doesn't address.
- `airtable_schema.md` — donor and donation field structure; the receipt logic queries this.
- `project_state.md` — what's been built around this model, what's planned, what's deferred.
- `BeANumber_Web_Funnel_Memo_v2.docx` (repo root) — the strategy memo that this doc enables.
