'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authFetch } from '@/lib/api';
import { Badge, StatCard } from '@/components/ui';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

interface FiringRate {
  step_name: string;
  calls: number;
  flagged: number;
  flag_rate: number;
  codes: Record<string, number>;
}

interface StepProfile {
  id: string;
  project_id: string;
  step_name: string;
  role: string | null;
  variance_tolerance: number | null;
  last_seen_at: string | null;
  last_evolved_at: string | null;
}

interface MetricBaseline {
  count: number;
  q1: number;
  median: number;
  q3: number;
  iqr: number;
  calibration_n: number;
}

interface AnomalyRow {
  id?: string;
  step_name: string;
  run_id: string;
  project_id: string | null;
  error_code: number;
  penalty_score: number;
  created_at: string;
  rule_name: string | null;
  layer: string | null;
}

interface CallRow {
  id: string;
  created_at: string;
  project_id: string | null;
  run_id: string;
  step_name: string;
  model: string | null;
  latency_ms: number | null;
  total_tokens: number | null;
  cost: number | null;
  status_success: boolean;
  anomaly_triggered: boolean | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-3">{children}</p>
);

export default function AdminPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [rates, setRates] = useState<FiringRate[]>([]);
  const [profiles, setProfiles] = useState<StepProfile[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [baselines, setBaselines] = useState<Record<string, Record<string, MetricBaseline | null> | null>>({});
  const [openProfile, setOpenProfile] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }
      setEmail(session.user.email ?? null);

      const me = await authFetch(`${BACKEND}/admin/me`);
      if (!me.ok) { setStatus('denied'); return; }
      setStatus('ok');

      const [r, p, a, c] = await Promise.all([
        authFetch(`${BACKEND}/admin/firing-rates`),
        authFetch(`${BACKEND}/admin/profiles`),
        authFetch(`${BACKEND}/admin/anomalies?limit=50`),
        authFetch(`${BACKEND}/admin/calls?limit=50`),
      ]);
      if (r.ok) setRates(await r.json());
      if (p.ok) setProfiles(await p.json());
      if (a.ok) setAnomalies(await a.json());
      if (c.ok) setCalls(await c.json());
    }
    load();
  }, [router]);

  async function toggleBaseline(profileId: string) {
    if (openProfile === profileId) { setOpenProfile(null); return; }
    setOpenProfile(profileId);
    if (!(profileId in baselines)) {
      const res = await authFetch(`${BACKEND}/admin/profiles/${profileId}/baseline`);
      if (res.ok) {
        const body = await res.json();
        setBaselines((prev) => ({ ...prev, [profileId]: body.baseline }));
      }
    }
  }

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased">
        <div className="max-w-5xl mx-auto px-6 py-8 font-mono text-xs text-[#7c7291]">loading…</div>
      </main>
    );
  }

  if (status === 'denied') {
    return (
      <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased">
        <div className="max-w-5xl mx-auto px-6 py-32 text-center">
          <p className="font-sans font-black text-2xl mb-2">Not authorized</p>
          <p className="font-mono text-xs text-[#9a91ad]">
            This page is for operators. Your account is not in ADMIN_EMAILS.
          </p>
        </div>
      </main>
    );
  }

  const totalCalls = rates.reduce((s, r) => s + r.calls, 0);
  const totalFlagged = rates.reduce((s, r) => s + r.flagged, 0);

  return (
    <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased">
      {/* Nav */}
      <div className="border-b border-[#3a2f4e]">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="flex items-center gap-2 font-sans font-black text-sm text-[#e9e4f0]">
              <img src="/logo.svg" alt="Cernova" className="w-5 h-5" />
              Cernova
            </a>
            <span className="text-[#7c7291]">|</span>
            <span className="font-mono text-[11px] text-[#b794f4] font-bold uppercase tracking-wider">admin</span>
            <span className="font-mono text-[11px] text-[#9a91ad]">{email}</span>
          </div>
          <a href="/dashboard" className="font-mono text-[11px] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">
            ← dashboard
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#3a2f4e]">
          <StatCard label="Calls in window" value={totalCalls.toLocaleString()} />
          <StatCard label="Flagged" value={totalFlagged.toLocaleString()} alert={totalFlagged > 0} />
          <StatCard
            label="Flag rate"
            value={totalCalls > 0 ? `${((totalFlagged / totalCalls) * 100).toFixed(1)}%` : '—'}
            alert={totalCalls > 0 && totalFlagged / totalCalls > 0.05}
          />
        </div>

        {/* Firing rates — the conformal health view */}
        <section>
          <SectionLabel>Scalar firing rates — last {totalCalls} calls, by step</SectionLabel>
          <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">
            <div className="grid grid-cols-[1fr_80px_80px_90px_1fr] gap-4 px-5 py-2 font-mono text-[10px] text-[#7c7291] uppercase tracking-wider">
              <span>step</span><span className="text-right">calls</span><span className="text-right">flagged</span>
              <span className="text-right">flag rate</span><span>codes fired</span>
            </div>
            {rates.map((r) => {
              const hot = r.flag_rate > 0.05;
              return (
                <div
                  key={r.step_name}
                  className={`grid grid-cols-[1fr_80px_80px_90px_1fr] gap-4 px-5 py-3 items-center ${hot ? 'border-l-2 border-l-[#e0533d]' : ''}`}
                >
                  <span className="font-sans font-bold text-sm truncate">{r.step_name}</span>
                  <span className="font-mono text-xs text-right text-[#b3abc4]">{r.calls}</span>
                  <span className={`font-mono text-xs text-right ${r.flagged > 0 ? 'text-[#d9c964]' : 'text-[#6b6180]'}`}>{r.flagged}</span>
                  <span className={`font-mono text-xs text-right font-bold ${hot ? 'text-[#e0533d]' : 'text-[#b3abc4]'}`}>
                    {(r.flag_rate * 100).toFixed(1)}%
                  </span>
                  <span className="font-mono text-[11px] text-[#9a91ad] truncate">
                    {Object.entries(r.codes).map(([code, n]) => `${code}×${n}`).join('  ') || '—'}
                  </span>
                </div>
              );
            })}
            {rates.length === 0 && (
              <div className="px-5 py-4 font-mono text-xs text-[#7c7291]">no calls yet</div>
            )}
          </div>
          <p className="font-mono text-[10px] text-[#7c7291] mt-2">
            sustained per-scalar rates far above conformal_alpha (1%) mean the baseline no longer describes the step — it will not self-heal
          </p>
        </section>

        {/* Step profiles + live baselines */}
        <section>
          <SectionLabel>Step profiles ({profiles.length})</SectionLabel>
          <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">
            {profiles.map((p) => (
              <div key={p.id}>
                <button
                  onClick={() => toggleBaseline(p.id)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-3 hover:bg-[#2d2440] transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={p.role ? 'info' : 'neutral'}>{p.role ?? 'unclassified'}</Badge>
                    <span className="font-sans font-bold text-sm truncate">{p.step_name}</span>
                    <span className="font-mono text-[10px] text-[#7c7291]">#{p.id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 font-mono text-[11px] text-[#9a91ad]">
                    {p.last_evolved_at && <span>evolved {timeAgo(p.last_evolved_at)}</span>}
                    <span>seen {timeAgo(p.last_seen_at)}</span>
                    <span className="text-[#7c7291]">{openProfile === p.id ? '▾' : '▸'}</span>
                  </div>
                </button>
                {openProfile === p.id && (
                  <div className="px-5 pb-4 bg-[#2d2440]">
                    {!(p.id in baselines) ? (
                      <p className="font-mono text-xs text-[#7c7291] py-2">computing baseline…</p>
                    ) : baselines[p.id] === null ? (
                      <p className="font-mono text-xs text-[#7c7291] py-2">
                        no baseline — fewer than 20 clean samples; L4 static limits govern this step
                      </p>
                    ) : (
                      <table className="w-full font-mono text-[11px]">
                        <thead>
                          <tr className="text-[#7c7291] uppercase text-[10px] tracking-wider">
                            <th className="text-left py-2">metric</th>
                            <th className="text-right">n</th>
                            <th className="text-right">q1</th>
                            <th className="text-right">median</th>
                            <th className="text-right">q3</th>
                            <th className="text-right">calibration n</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#c9c2d6]">
                          {Object.entries(baselines[p.id]!).map(([metric, st]) => (
                            <tr key={metric} className="border-t border-[#3a2f4e]">
                              <td className="py-1.5 text-[#b3abc4]">{metric}</td>
                              {st ? (
                                <>
                                  <td className="text-right">{st.count}</td>
                                  <td className="text-right">{st.q1.toFixed(2)}</td>
                                  <td className="text-right">{st.median.toFixed(2)}</td>
                                  <td className="text-right">{st.q3.toFixed(2)}</td>
                                  <td className="text-right text-[#7fb59a]">{st.calibration_n}</td>
                                </>
                              ) : (
                                <td colSpan={5} className="text-right text-[#7c7291]">—</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
            {profiles.length === 0 && (
              <div className="px-5 py-4 font-mono text-xs text-[#7c7291]">no step profiles yet</div>
            )}
          </div>
        </section>

        {/* Recent anomalies */}
        <section>
          <SectionLabel>Recent anomalies ({anomalies.length})</SectionLabel>
          <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">
            {anomalies.map((a, i) => (
              <div key={a.id ?? i} className="flex items-center justify-between gap-4 px-5 py-2.5 border-l-2 border-l-[#e0533d]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] font-bold text-[#e0533d]">{a.error_code}</span>
                  <span className="font-mono text-[11px] text-[#c9c2d6] truncate">{a.rule_name ?? '?'}</span>
                  {a.layer && <Badge variant="neutral">{a.layer}</Badge>}
                </div>
                <div className="flex items-center gap-5 shrink-0 font-mono text-[11px] text-[#9a91ad]">
                  <span className="truncate max-w-[140px]">{a.step_name}</span>
                  <span className="text-[#d9c964]">+{a.penalty_score}</span>
                  <span>{timeAgo(a.created_at)}</span>
                </div>
              </div>
            ))}
            {anomalies.length === 0 && (
              <div className="px-5 py-4 font-mono text-xs text-[#7c7291]">no anomalies fired</div>
            )}
          </div>
        </section>

        {/* Recent calls */}
        <section>
          <SectionLabel>Recent calls ({calls.length})</SectionLabel>
          <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">
            <div className="grid grid-cols-[1fr_120px_80px_80px_70px_70px] gap-4 px-5 py-2 font-mono text-[10px] text-[#7c7291] uppercase tracking-wider">
              <span>step</span><span>model</span><span className="text-right">latency</span>
              <span className="text-right">tokens</span><span className="text-right">cost</span><span className="text-right">when</span>
            </div>
            {calls.map((c) => (
              <div
                key={c.id}
                className={`grid grid-cols-[1fr_120px_80px_80px_70px_70px] gap-4 px-5 py-2 items-center ${
                  c.anomaly_triggered ? 'border-l-2 border-l-[#e0533d]' : !c.status_success ? 'border-l-2 border-l-[#d9a441]' : ''
                }`}
              >
                <span className="font-mono text-[11px] text-[#c9c2d6] truncate">{c.step_name}</span>
                <span className="font-mono text-[11px] text-[#9a91ad] truncate">{c.model ?? '—'}</span>
                <span className="font-mono text-[11px] text-right text-[#b3abc4]">{c.latency_ms != null ? `${c.latency_ms}ms` : '—'}</span>
                <span className="font-mono text-[11px] text-right text-[#b3abc4]">{c.total_tokens ?? '—'}</span>
                <span className="font-mono text-[11px] text-right text-[#b3abc4]">{c.cost != null ? `$${Number(c.cost).toFixed(4)}` : '—'}</span>
                <span className="font-mono text-[11px] text-right text-[#7c7291]">{timeAgo(c.created_at)}</span>
              </div>
            ))}
            {calls.length === 0 && (
              <div className="px-5 py-4 font-mono text-xs text-[#7c7291]">no calls yet</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
