'use client'

import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Cernova shared design system — "Amethyst" (product register)
//
// The landing/docs wear the full editorial treatment; the product wears the
// same identity, kept calm and scannable. Deep plum ground, lavender ink,
// violet for the brand only, and a strict status grammar so what needs
// attention reads at a glance:
//   red    #e0533d  — anomaly fired / critical   (never decorative)
//   gold   #d9c964  — drifting
//   amber  #d9a441  — warning
//   green  #7fb59a  — healthy (muted, so red stays the loud one)
//   violet #b794f4  — Cernova itself (brand, never a status)
//
// Tokens:
//   paper   #201a2b   canvas          panel   #281f38   cards/surfaces
//   raised  #2d2440   hover/active    track   #332946   tracks/inputs/bands
//   rule    #3a2f4e   borders         rule2   #4a3d63   hover borders
//   ink     #e9e4f0   values          ink2 #c9c2d6 body   ink3 #b3abc4 mid
//   ink4    #9a91ad   dim labels      ink5 #7c7291 faint
//
// Rules: NO rounded corners, NO gradients, NO glow, NO shadow. Solid violet
// fills only. Left border bars (border-l-2) for state accents on rows.
// ─────────────────────────────────────────────────────────────────────────────

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeVariant = 'ok' | 'error' | 'critical' | 'warning' | 'drift' | 'info' | 'neutral'

const BADGE_STYLES: Record<BadgeVariant, string> = {
  ok:       'bg-[#7fb59a]/15 text-[#7fb59a]',
  error:    'bg-[#e0533d] text-[#201a2b]',
  critical: 'bg-[#e0533d] text-[#201a2b]',
  warning:  'bg-[#d9a441]/15 text-[#d9a441]',
  drift:    'bg-[#d9c964] text-[#201a2b]',
  info:     'bg-[#b794f4]/18 text-[#cdb9f7]',
  neutral:  'bg-[#332946] text-[#9a91ad]',
}

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-[10px] font-bold font-mono px-1.5 py-0.5 uppercase tracking-wider shrink-0 ${BADGE_STYLES[variant]}`}>
      {children}
    </span>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────

export function StatCard({ label, value, mono, alert }: {
  label: string
  value: string
  mono?: boolean
  alert?: boolean
}) {
  return (
    <div className="bg-[#281f38] border border-[#3a2f4e] px-4 py-4">
      <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">{label}</p>
      <p className={[
        'text-xl tabular-nums',
        mono ? 'font-mono' : 'font-sans font-black',
        alert ? 'text-[#e0533d]' : 'text-[#e9e4f0]',
      ].join(' ')}>
        {value}
      </p>
    </div>
  )
}

// ── SearchInput ───────────────────────────────────────────────────────────────

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative mb-4">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7c7291] text-xs pointer-events-none">⌕</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className="w-full bg-[#201a2b] border border-[#3a2f4e] pl-7 pr-9 py-2 text-xs font-mono text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a91ad] hover:text-[#c9c2d6] text-sm leading-none"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-24 font-mono text-xs text-[#7c7291]">{text}</div>
}

// ── SegmentedControl ──────────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex border border-[#3a2f4e]">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={[
            'px-3 py-1.5 font-mono text-xs transition-colors',
            i < options.length - 1 ? 'border-r border-[#3a2f4e]' : '',
            value === opt.value ? 'bg-[#2d2440] text-[#e9e4f0]' : 'text-[#9a91ad] hover:text-[#c9c2d6]',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={['relative w-9 h-5 transition-colors shrink-0', checked ? 'bg-[#b794f4]' : 'bg-[#332946]'].join(' ')}
    >
      <span className={[
        'absolute top-0.5 left-0.5 w-4 h-4 bg-[#e9e4f0] transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0',
      ].join(' ')} />
    </button>
  )
}

// ── CopyButton ────────────────────────────────────────────────────────────────

export function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => { e.preventDefault(); navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className={`font-mono text-[10px] text-[#7c7291] hover:text-[#b3abc4] transition-colors ${className}`}
    >
      {copied ? 'copied ✓' : 'copy'}
    </button>
  )
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1">{children}</p>
  )
}
