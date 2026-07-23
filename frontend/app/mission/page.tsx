import type { Metadata } from 'next'
import Link from 'next/link'
import MarketingChrome, { InkButton } from '@/components/MarketingChrome'

export const metadata: Metadata = {
  title: 'Mission — Cernova AI',
  description:
    'Anyone can build an AI system now. Keeping it working is the unsolved problem. Cernova is the maintenance layer for AI agents.',
}

const SPINE = [
  {
    no: '01',
    kicker: 'The world',
    title: <>Anyone can ship an agent now.</>,
    body: (
      <>
        From businesses to solo developers, everyone is shipping AI agents and workflows. Tools like Cursor and Replit made building these projects completable in a weekend.
      </>
    ),
  },
  {
    no: '02',
    kicker: 'The problem',
    title: <>Keeping them working is another story.</>,
    body: (
      <>
        Current monitoring tools demand high technical depth, enterprise budgets, and time no small team has. And AI usually fails silently — the first person to notice is usually a user in production.
      </>
    ),
  },
  {
    no: '03',
    kicker: 'The fix',
    title: <>That&apos;s what Cernova fixes.</>,
    body: (
      <>
        One line of code — or just tell your coding agent to install it — and our own ML watches every call your agents make. It learns what normal looks like for every step of your pipeline. When something breaks the pattern, you don&apos;t get a dashboard to stare at. You get what broke, why, and the fix.
      </>
    ),
  },
  {
    no: '04',
    kicker: 'Who, now',
    title: <>Built for the people every other tool skipped.</>,
    body: (
      <>
        Today we&apos;re building for indie developers and small teams shipping agents without an ML team behind them. People who can stand up a workflow in a weekend — and still need something watching it on Monday.
      </>
    ),
  },
  {
    no: '05',
    kicker: 'Who, later',
    title: <>The same engine scales with you.</>,
    body: (
      <>
        As those teams grow — and for companies already running serious agent fleets — the same detection becomes the reliability layer for production AI. We&apos;ve already had those conversations. The demand is there.
      </>
    ),
  },
] as const

export default function MissionPage() {
  return (
    <MarketingChrome active="mission">
      <section className="px-6 pt-10 pb-16">
        <div className="max-w-6xl mx-auto">
          <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#c9c2d6] mb-5">
            The brief
          </p>
          <h1 className="f-news font-bold text-5xl sm:text-7xl leading-[0.98] tracking-tight text-[#e9e4f0] mb-8 max-w-4xl">
            Anyone can build an AI system now.{' '}
            <span className="italic text-[#c9c2d6]">Keeping it working is the unsolved problem.</span>
          </h1>
          <p className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] border-l-2 border-[#e9e4f0] pl-4 leading-6 max-w-lg">
            <span className="text-[#b794f4]">Cernova </span>
            is the maintenance layer.
          </p>
        </div>
      </section>

      {SPINE.map((s, i) => (
        <section key={s.no} className="px-6 py-20">
          <div className="max-w-6xl mx-auto">
            <div className="border-t-2 border-[#e9e4f0] pt-5 mb-10">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                <div>
                  <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#c9c2d6]">
                    {s.no} — {s.kicker}
                  </p>
                  <h2 className="f-news font-bold text-4xl sm:text-5xl text-[#e9e4f0] mt-5 leading-[1.02] tracking-tight max-w-2xl">
                    {s.title}
                  </h2>
                </div>
                {i === 1 && (
                  <p className="f-news italic text-[17px] text-[#9a91ad] max-w-sm lg:text-right leading-7">
                    Silent failures. Green dashboards. Users as the alarm.
                  </p>
                )}
              </div>
            </div>
            <p className={`f-news text-[18px] sm:text-[19px] text-[#c9c2d6] leading-9 max-w-3xl ${i === 0 ? 'dropcap' : ''}`}>
              {s.body}
            </p>
          </div>
        </section>
      ))}

      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="border-t-2 border-[#e9e4f0] pt-5 mb-10">
            <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#c9c2d6]">
              06 — Future scale
            </p>
            <h2 className="f-news font-bold text-4xl sm:text-5xl text-[#e9e4f0] mt-5 leading-[1.02] tracking-tight max-w-3xl">
              A reliability layer for production AI fleets.
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-14 items-start">
            <p className="lg:col-span-3 f-news text-[18px] text-[#c9c2d6] leading-9">
              The long arc is simple: the same engine that watches a weekend prototype becomes the reliability layer for production AI fleets — learning baselines across every step, catching silent regressions, and pushing what broke, why, and the fix to wherever teams already look.
            </p>
            <blockquote className="lg:col-span-2 border-l-2 border-[#e0533d] pl-6 py-2">
              <p className="f-news italic text-[24px] sm:text-[28px] leading-[1.3] text-[#e9e4f0]">
                &ldquo;Anyone can build an AI system now. Keeping it working is the unsolved problem.&rdquo;
              </p>
              <footer className="f-type text-[11px] uppercase tracking-[0.18em] text-[#9a91ad] mt-5">— Cernova</footer>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="px-6 py-28 border-t-2 border-[#e9e4f0]">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="f-news font-bold text-5xl sm:text-6xl text-[#e9e4f0] leading-[1.0] tracking-tight mb-6">
            Cernova is the maintenance layer.
          </h2>
          <p className="f-news italic text-lg text-[#9a91ad] mb-12 max-w-xl mx-auto">
            One line of code. Or tell your coding agent to install it. Free to start.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <InkButton href="/login">Start free →</InkButton>
            <Link
              href="/docs"
              className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#e9e4f0] transition-colors"
            >
              Read the docs
            </Link>
            <Link
              href="/about"
              className="f-type text-[12px] uppercase tracking-[0.14em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors"
            >
              Meet the founders →
            </Link>
          </div>
        </div>
      </section>
    </MarketingChrome>
  )
}
