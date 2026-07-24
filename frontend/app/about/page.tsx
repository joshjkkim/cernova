import type { Metadata } from 'next'
import Link from 'next/link'
import MarketingChrome, { InkButton } from '@/components/MarketingChrome'

export const metadata: Metadata = {
  title: 'About — Cernova AI',
  description:
    'Two founders who kept watching production agents go wrong with no one catching it in time. Why we built Cernova — and who it is for.',
}

const BELIEFS = [
  {
    no: '01',
    title: 'Quiet failures first',
    body: "Most teams find out the hard way — a ticket, a confused customer, a metric that looks fine until it doesn't. Green dashboards hide the break.",
  },
  {
    no: '02',
    title: "Traces aren't answers",
    body: "Spans help, but you shouldn't have to live inside every one to stay safe. Surface what broke, why it matters, and a path to fix it.",
  },
  {
    no: '03',
    title: 'Out of the loop',
    body: 'The person who owns the agent is usually also shipping product. Nobody has spare cycles to build debugging infrastructure around a moving model.',
  },
  {
    no: '04',
    title: 'Human when it counts',
    body: 'Automate the catch and the diagnosis. Keep a human in the loop when approval still matters — not for every false alarm.',
  },
  {
    no: '05',
    title: 'Not another babysit',
    body: 'That\'s the pain we care about. Not another dashboard to stare at while the agent keeps "succeeding."',
  },
  {
    no: '06',
    title: "Who it's for",
    body: 'Engineers who inherited the agent — the person who gets paged when it breaks, not a committee that needs a sales one-pager first.',
  },
] as const

function FounderFrame({
  initials,
  name,
  role,
  tilt,
}: {
  initials: string
  name: string
  role: string
  tilt: 'left' | 'right'
}) {
  const rotate = tilt === 'left' ? '-rotate-3' : 'rotate-3'
  return (
    <figure
      className={`relative w-[140px] sm:w-[168px] bg-[#e9e4f0] p-2.5 pb-8 shadow-[4px_4px_0_#201a2b] ${rotate}`}
    >
      {/* tape */}
      <span
        aria-hidden
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-14 h-5 bg-[#b794f4]/45 border border-[#e9e4f0]/30 rotate-[-2deg]"
      />
      <div className="aspect-[4/5] bg-[#201a2b] border-2 border-[#201a2b] flex items-center justify-center">
        <span className="f-news font-bold text-4xl sm:text-5xl text-[#b794f4] tracking-tight">
          {initials}
        </span>
      </div>
      <figcaption className="mt-3 text-center">
        <p className="f-type text-[10px] font-bold uppercase tracking-[0.16em] text-[#201a2b]">{name}</p>
        <p className="f-type text-[9px] uppercase tracking-[0.14em] text-[#332946] mt-0.5">{role}</p>
      </figcaption>
    </figure>
  )
}

export default function AboutPage() {
  return (
    <MarketingChrome active="about">
      {/* 1. Hero — centered kicker, headline, sub, CTA */}
      <section className="px-6 pt-16 pb-20 sm:pt-20 sm:pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#c9c2d6] mb-6">
            Why we built this
          </p>
          <h1 className="f-news font-bold text-5xl sm:text-7xl leading-[0.98] tracking-tight text-[#e9e4f0] mb-7">
            Your agent went sideways in production.
            <span className="block mt-3 sm:mt-4 italic text-[#c9c2d6]">
              You found out from a user — not from your tooling.
            </span>
          </h1>
          <p className="f-news text-lg sm:text-xl text-[#c9c2d6] leading-8 max-w-xl mx-auto mb-10">
            Green dashboards. Quiet failures. The person who owns the agent also has to ship product. Sound familiar?
          </p>
          <InkButton href="/login">Start free →</InkButton>
        </div>
      </section>

      {/* 2. About core — lifted story sheet + founder frames */}
      <section className="px-6 pb-20 sm:pb-28">
        <div className="max-w-4xl mx-auto relative">
          {/* Polaroids — mobile: side-by-side above sheet; desktop: overlap edges */}
          <div className="flex justify-center gap-6 sm:gap-10 mb-8 lg:contents">
            <div className="lg:absolute lg:-left-20 lg:top-10 lg:z-10 xl:-left-40">
              <FounderFrame initials="J" name="Jayden" role="CEO" tilt="left" />
            </div>
            <div className="lg:absolute lg:-right-16 lg:top-28 lg:z-10 xl:-right-32">
              <FounderFrame initials="J" name="Josh" role="CTO" tilt="right" />
            </div>
          </div>

          <div className="bg-[#281f38] border-2 border-[#e9e4f0] px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
            <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#9a91ad] mb-5 text-center">
              How we got here
            </p>
            <h2 className="f-news font-bold text-3xl sm:text-4xl text-[#e9e4f0] leading-[1.05] tracking-tight text-center mb-10 max-w-xl mx-auto">
              We kept hitting the same wall.
            </h2>

            <div className="max-w-2xl mx-auto space-y-6">
              <p className="dropcap f-news text-[18px] sm:text-[19px] text-[#c9c2d6] leading-9">
                We&apos;re Jayden and Josh — CEO and CTO. Best friends since high school, living in different states now, still stuck on the same problem. We were building agents and watching them do something wrong in production with nobody able to say why. Traces existed. Answers didn&apos;t.
              </p>
              <p className="f-news text-[16px] sm:text-[17px] text-[#c9c2d6] leading-8">
                So we started talking to engineers who actually run this stuff — people at places like Experian, Salesforce, smaller teams shipping agents without an ML org behind them. Discovery calls, not pitch decks. Almost every conversation landed in the same place: the model drifts or breaks a step, the pipeline still &ldquo;succeeds,&rdquo; and the first alert is a human complaining downstream.
              </p>
              <p className="f-news text-[16px] sm:text-[17px] text-[#c9c2d6] leading-8">
                Cernova is what we built from that wall — a maintenance layer for AI agents. It learns what normal looks like for your steps, catches silent failures, and helps you diagnose and fix without living inside every trace.
              </p>
              <p className="f-news text-[16px] sm:text-[17px] text-[#c9c2d6] leading-8">
                Jayden runs the company. Josh builds the product. A two-person team is a feature: if you talk to us, you&apos;re talking to the people building it — not a support queue reading from a script.
              </p>
            </div>

            {/* Typographic signatures — Newsreader italic, not fake script fonts */}
            <div className="mt-12 pt-8 border-t border-[#e9e4f0]/25 flex flex-wrap items-end justify-center gap-x-16 gap-y-6">
              <div className="text-center">
                <p className="f-news italic text-3xl sm:text-4xl text-[#e9e4f0] leading-none tracking-tight">Jayden</p>
                <p className="f-type text-[10px] uppercase tracking-[0.2em] text-[#9a91ad] mt-2">CEO</p>
              </div>
              <div className="text-center">
                <p className="f-news italic text-3xl sm:text-4xl text-[#e9e4f0] leading-none tracking-tight">Josh</p>
                <p className="f-type text-[10px] uppercase tracking-[0.2em] text-[#9a91ad] mt-2">CTO</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. What we ship — light product strip, no fake icons */}
      <section className="px-6 pb-20 sm:pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#c9c2d6] mb-4">
            What we ship
          </p>
          <h2 className="f-news font-bold text-3xl sm:text-4xl text-[#e9e4f0] leading-[1.05] tracking-tight mb-4">
            One product. The maintenance layer.
          </h2>
          <p className="f-news text-[17px] text-[#c9c2d6] leading-8 mb-8 max-w-xl mx-auto">
            Catch silent failures, diagnose the step that broke, and get a path to fix — without babysitting another dashboard.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <Link
              href="/"
              className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#b794f4] transition-colors"
            >
              See the product
            </Link>
            <Link
              href="/docs"
              className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#b794f4] transition-colors"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Beliefs / how we work — clean grid, no ornaments */}
      <section className="px-6 pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-14">
            <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#c9c2d6] mb-4">
              What we believe
            </p>
            <h2 className="f-news font-bold text-4xl sm:text-5xl text-[#e9e4f0] leading-[1.02] tracking-tight max-w-2xl mx-auto">
              Agents fail quietly. Your week doesn&apos;t.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-2 border-[#e9e4f0] bg-[#281f38]">
            {BELIEFS.map((b, i) => {
              const borders = [
                'px-6 py-8 sm:px-7 sm:py-9 border-[#e9e4f0]',
                // mobile: stack dividers
                i < BELIEFS.length - 1 ? 'border-b-2' : '',
                // sm 2-col: right on odd indices (0-based even), bottom on first row
                i % 2 === 0 ? 'sm:border-r-2' : 'sm:border-r-0',
                i < 4 ? 'sm:border-b-2' : 'sm:border-b-0',
                // lg 3-col: right except last in row; bottom on first row only
                i % 3 !== 2 ? 'lg:border-r-2' : 'lg:border-r-0',
                i < 3 ? 'lg:border-b-2' : 'lg:border-b-0',
              ]
              return (
                <div key={b.no} className={borders.filter(Boolean).join(' ')}>
                  <p className="f-type text-[11px] font-bold uppercase tracking-[0.2em] text-[#b794f4] mb-3">
                    {b.no}
                  </p>
                  <h3 className="f-news font-bold text-xl sm:text-[22px] text-[#e9e4f0] leading-tight mb-3">
                    {b.title}
                  </h3>
                  <p className="f-news text-[15px] sm:text-[16px] text-[#c9c2d6] leading-7">{b.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 5. Soft final CTA */}
      <section className="px-6 py-20 sm:py-24 border-t-2 border-[#e9e4f0]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="f-news font-bold text-4xl sm:text-5xl text-[#e9e4f0] leading-[1.05] tracking-tight mb-5">
            Talk to us. Or just start.
          </h2>
          <p className="f-news italic text-lg text-[#9a91ad] mb-10 max-w-xl mx-auto">
            Free to try. Docs if you want the details first.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <InkButton href="/login">Start free →</InkButton>
            <Link
              href="/docs"
              className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#e9e4f0] transition-colors"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </MarketingChrome>
  )
}
