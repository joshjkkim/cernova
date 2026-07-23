'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

const INK = '#e9e4f0'
const PAPER = '#201a2b'
const HILITE = '#d9c964'

export const MARKETING_NAV: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/mission', label: 'Mission' },
  { href: '/docs', label: 'Docs' },
]

function InkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block f-type text-[13px] font-bold uppercase tracking-[0.14em] px-7 py-3.5 bg-[#b794f4] text-[#201a2b] shadow-[5px_5px_0_#e9e4f0] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0_#e9e4f0] transition-all duration-150"
    >
      {children}
    </Link>
  )
}

export { InkButton }

export default function MarketingChrome({
  children,
  active,
}: {
  children: ReactNode
  active?: 'about' | 'mission' | 'docs' | 'home'
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#201a2b] text-[#e9e4f0]" style={{ fontFamily: 'var(--font-news), Georgia, serif' }}>
      <style>{`
        .f-news { font-family: var(--font-news), Georgia, serif; }
        .f-type { font-family: var(--font-type), 'Courier New', monospace; }
        ::selection { background: ${HILITE}; color: ${PAPER}; }
        .dropcap::first-letter { float: left; font-size: 3.4em; line-height: .85; padding-right: 10px; padding-top: 4px; font-weight: 700; color: ${INK}; }
      `}</style>

      <nav className="sticky top-0 z-50 bg-[#201a2b] border-b-2 border-[#e9e4f0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 f-news font-bold text-2xl tracking-tight text-[#e9e4f0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={28} height={28} className="shrink-0" />
            Cernova
          </Link>
          <div className="hidden sm:flex items-center gap-7">
            {MARKETING_NAV.map((l) => {
              const isActive =
                (active === 'home' && l.href === '/') ||
                (active === 'about' && l.href === '/about') ||
                (active === 'mission' && l.href === '/mission') ||
                (active === 'docs' && l.href === '/docs')
              return (
                <Link
                  key={l.label}
                  href={l.href}
                  className={`f-type text-[11px] uppercase tracking-[0.16em] transition-colors ${
                    isActive ? 'font-bold text-[#b794f4]' : 'text-[#9a91ad] hover:text-[#e9e4f0]'
                  }`}
                >
                  {l.label}
                </Link>
              )
            })}
            <Link href="/login" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Sign in</Link>
            <Link href="/login" className="f-type text-[11px] font-bold uppercase tracking-[0.14em] px-4 py-2 bg-[#b794f4] text-[#201a2b] hover:bg-[#e9e4f0] transition-colors">Start free →</Link>
          </div>
          <button
            className="sm:hidden f-type text-[12px] font-bold uppercase tracking-[0.16em] text-[#e9e4f0] px-2 py-1 border border-[#e9e4f0]/40"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? '✕ close' : '☰ menu'}
          </button>
        </div>
        {menuOpen && (
          <div className="sm:hidden border-t border-[#e9e4f0]/40 bg-[#201a2b] px-6 py-4 flex flex-col gap-4">
            {MARKETING_NAV.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="f-type text-[12px] uppercase tracking-[0.16em] text-[#c9c2d6] hover:text-[#e9e4f0] transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setMenuOpen(false)} className="f-type text-[12px] uppercase tracking-[0.16em] text-[#c9c2d6] hover:text-[#e9e4f0] transition-colors">Sign in</Link>
            <Link href="/login" onClick={() => setMenuOpen(false)} className="f-type text-[12px] font-bold uppercase tracking-[0.14em] px-4 py-2.5 bg-[#b794f4] text-[#201a2b] self-start">Start free →</Link>
          </div>
        )}
      </nav>

      {children}

      <footer className="border-t-2 border-[#e9e4f0] py-8 px-6 bg-[#332946]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 f-news font-bold text-lg text-[#e9e4f0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={18} height={18} className="shrink-0" />
            Cernova
          </Link>
          <p className="f-type text-[10px] uppercase tracking-[0.18em] text-[#9a91ad]">Set in Newsreader & Courier Prime · printed continuously</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Home</Link>
            <Link href="/about" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">About</Link>
            <Link href="/mission" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Mission</Link>
            <Link href="/docs" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Docs</Link>
            <Link href="/login" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
