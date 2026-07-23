'use client';

import { useEffect, useState, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authFetch } from '@/lib/api';
import { Badge, StatCard, SearchInput, EmptyState, SegmentedControl, Toggle } from '@/components/ui';
import type { Call, KeySpec, ContractRow, MetricTrend, StepHealthRow, AnomalyRow, Incident, Tab } from './types';
import {
  FirstRun, TourOverlay, TOUR_STEPS,
  DEMO_CALLS, DEMO_ANOMALIES, DEMO_STEP_HEALTH, DEMO_CONTRACTS, DEMO_INCIDENTS,
} from './onboarding';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

interface Project {
  id: string;
  name: string;
  API_KEY: string;
  owner: string;
  created_at: string;
  call_count: number;
  slack_webhook_url?: string | null;
  alert_on_error?: boolean;
  alert_error_rate_threshold?: number | null;
  alert_error_rate_window?: number | null;
  sentry_dsn?: string | null;
  sentry_alert_level?: string | null;
  slack_anomaly_level?: string | null;
  threshold_mode?: string | null;
  threshold_latency_ms?: number | null;
  threshold_tokens?: number | null;
  threshold_cost?: number | null;
  monthly_budget_usd?: number | null;
  webhook_url?: string | null;
  webhook_secret?: string | null;
  webhook_anomaly_level?: string | null;
  systemic_enabled?: boolean;
  systemic_window_min?: number | null;
  systemic_min_runs?: number | null;
}

interface Run {
  runId: string;
  steps: Call[];
  totalCost: number;
  totalTokens: number;
  totalLatency: number;
  errorCount: number;
  createdAt: string;
}

const L5_MIN_SAMPLES = 20;

interface ConditionInfo {
  name: string;
  layer: string;
  penalty: number;
  description: string;
}

type ConditionRegistry = Record<string, ConditionInfo>;

interface AnomalyRun {
  run_id: string;
  total_score: number;
  is_critical: boolean;
  steps: { step_name: string; codes: { code: number; score: number }[] }[];
  latest_at: string;
}

const ANOMALY_THRESHOLD = 100;

function groupAnomalies(rows: AnomalyRow[]): AnomalyRun[] {
  const map = new Map<string, AnomalyRun>();
  for (const row of rows) {
    if (!map.has(row.run_id)) {
      map.set(row.run_id, { run_id: row.run_id, total_score: 0, is_critical: false, steps: [], latest_at: row.created_at });
    }
    const run = map.get(row.run_id)!;
    run.total_score += row.penalty_score;
    run.is_critical = run.total_score >= ANOMALY_THRESHOLD;
    if (row.created_at > run.latest_at) run.latest_at = row.created_at;
    let step = run.steps.find((s) => s.step_name === row.step_name);
    if (!step) { step = { step_name: row.step_name, codes: [] }; run.steps.push(step); }
    step.codes.push({ code: row.error_code, score: row.penalty_score });
  }
  return Array.from(map.values()).sort((a, b) => b.latest_at.localeCompare(a.latest_at));
}

type ConnectionStatus = 'connecting' | 'connected' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupIntoRuns(calls: Call[]): Run[] {
  const byRunId = new Map<string, Call[]>();
  for (const call of calls) {
    const rid = call.run_id ?? 'unknown';
    if (!byRunId.has(rid)) byRunId.set(rid, []);
    byRunId.get(rid)!.push(call);
  }
  return Array.from(byRunId.entries())
    .map(([runId, steps]) => ({
      runId,
      steps: [...steps].sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0)),
      totalCost: steps.reduce((s, c) => s + (c.cost ?? 0), 0),
      totalTokens: steps.reduce((s, c) => s + (c.total_tokens ?? 0), 0),
      totalLatency: steps.reduce((s, c) => s + (c.latency_ms ?? 0), 0),
      errorCount: steps.filter((c) => c.status_success === false).length,
      createdAt: steps.reduce((earliest, c) =>
        c.created_at && (!earliest || c.created_at < earliest) ? c.created_at : earliest, ''),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type TimeRange = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';

const RANGES: Record<TimeRange, { label: string; hours: number; buckets: number }> = {
  '15m': { label: '15m', hours: 0.25, buckets: 15 },
  '1h':  { label: '1h',  hours: 1,    buckets: 12 },
  '6h':  { label: '6h',  hours: 6,    buckets: 12 },
  '24h': { label: '24h', hours: 24,   buckets: 24 },
  '7d':  { label: '7d',  hours: 168,  buckets: 28 },
  '30d': { label: '30d', hours: 720,  buckets: 30 },
};

function timeBuckets(calls: Call[], bucketCount = 24, hours = 24) {
  const now = Date.now();
  const windowMs = hours * 3600_000;
  const bucketMs = windowMs / bucketCount;
  const start = now - windowMs;

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    label: new Date(start + i * bucketMs),
    calls: 0,
    cost: 0,
    tokens: 0,
    errors: 0,
  }));

  for (const call of calls) {
    if (!call.created_at) continue;
    const t = new Date(call.created_at).getTime();
    const idx = Math.floor((t - start) / bucketMs);
    if (idx >= 0 && idx < bucketCount) {
      buckets[idx].calls++;
      buckets[idx].cost += call.cost ?? 0;
      buckets[idx].tokens += call.total_tokens ?? 0;
      if (call.status_success === false) buckets[idx].errors++;
    }
  }
  return buckets;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const router = useRouter();

  const [project, setProject]             = useState<Project | null>(null);
  const [calls, setCalls]                 = useState<Call[]>([]);
  const [status, setStatus]               = useState<ConnectionStatus>('connecting');
  const [authError, setAuthError]         = useState(false);
  const [tab, setTab]                     = useState<Tab>('overview');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall]   = useState<Call | null>(null);
  const [anomalies, setAnomalies]         = useState<AnomalyRow[]>([]);
  const [conditionRegistry, setConditionRegistry] = useState<ConditionRegistry>({});
  const [analysis, setAnalysis]           = useState<{ runId: string; text: string; costUsd: number } | null>(null);
  const [analyzing, setAnalyzing]         = useState(false);
  const [logsQuery, setLogsQuery]         = useState('');
  const [runsQuery, setRunsQuery]         = useState('');
  const [stepHealth, setStepHealth]       = useState<StepHealthRow[]>([]);
  const [contracts, setContracts]         = useState<ContractRow[]>([]);
  const [incidents, setIncidents]         = useState<Incident[]>([]);
  const [tourStep, setTourStep]           = useState<number | null>(null);

  const hasData  = calls.length > 0;
  // Demo mode: while the tour runs on an empty project, render a sample dataset so
  // each tab shows what real traffic looks like. Display-only, never persisted.
  const demoMode = tourStep !== null && !hasData;
  const viewCalls     = demoMode ? DEMO_CALLS : calls;
  const viewAnomalies = demoMode ? DEMO_ANOMALIES : anomalies;
  const viewHealth    = demoMode ? DEMO_STEP_HEALTH : stepHealth;
  const viewContracts = demoMode ? DEMO_CONTRACTS : contracts;
  const viewIncidents = demoMode ? DEMO_INCIDENTS : incidents;

  const runs = useMemo(() => groupIntoRuns(viewCalls), [viewCalls]);
  const selectedRun = useMemo(() => runs.find((r) => r.runId === selectedRunId) ?? null, [runs, selectedRunId]);
  const anomalyRuns = useMemo(() => groupAnomalies(viewAnomalies), [viewAnomalies]);
  const criticalCount = anomalyRuns.filter((r) => r.is_critical).length;
  const anomalyMap = useMemo(() => new Map(anomalyRuns.map((r) => [r.run_id, r])), [anomalyRuns]);

  async function analyzeRun(runId: string) {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await authFetch(`${BACKEND}/analyze/run/${runId}`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAnalysis({ runId, text: data.analysis, costUsd: data.cost_usd });
    } catch (e) {
      console.error('[analyze]', e);
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }

      const { data: profile } = await supabase
        .from('PROFILES').select('id').eq('email', session.user.email).single();
      if (!profile) { router.replace('/dashboard'); return; }

      const res = await authFetch(`${BACKEND}/projects/${projectId}`);
      if (res.status === 401) { router.replace('/'); return; }
      if (res.status === 403) { setAuthError(true); return; }
      if (!res.ok) { router.replace('/dashboard'); return; }
      const proj: Project = await res.json();
      setProject(proj);

      const [callsRes, anomaliesRes, registryRes, healthRes, incidentsRes] = await Promise.all([
        authFetch(`${BACKEND}/calls/project/${projectId}`),
        authFetch(`${BACKEND}/anomalies/project/${proj.id}`),
        authFetch(`${BACKEND}/anomalies/registry`),
        authFetch(`${BACKEND}/projects/${proj.id}/step-health`),
        authFetch(`${BACKEND}/incidents/project/${proj.id}`),
      ]);
      const loadedCalls = callsRes.ok ? (await callsRes.json() as Call[]).slice().reverse() : [];
      setCalls(loadedCalls);
      // First-time tour: only on a genuinely empty (just-created) project, once ever.
      if (loadedCalls.length === 0 && !localStorage.getItem('cernova_tour_seen')) setTourStep(0);
      if (anomaliesRes.ok) setAnomalies(await anomaliesRes.json() as AnomalyRow[]);
      if (registryRes.ok) setConditionRegistry(await registryRes.json() as ConditionRegistry);
      if (healthRes.ok) setStepHealth(await healthRes.json() as StepHealthRow[]);
      if (incidentsRes.ok) setIncidents(await incidentsRes.json() as Incident[]);

      // Contracts are API-key authed (same endpoint the SDK/CLI uses).
      const contractsRes = await fetch(`${BACKEND}/contracts`, {
        headers: { Authorization: `Bearer ${proj.API_KEY}` },
      });
      if (contractsRes.ok) setContracts(((await contractsRes.json()).contracts ?? []) as ContractRow[]);
    }
    init();
  }, [projectId, router]);

  useEffect(() => {
    const channel = supabase
      .channel(`calls-project-${projectId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'CALLS' }, (payload) => {
        const call = payload.new as Call;
        if (call.project_id !== projectId) return;
        setCalls((prev) => [call, ...prev]);
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('connected');
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('error');
      });
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  useEffect(() => {
    const channel = supabase
      .channel(`anomalies-project-${projectId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ANOMALIES' }, (payload) => {
        const row = payload.new as AnomalyRow;
        if (row.project_id !== projectId) return;
        setAnomalies((prev) => [...prev, row]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  // Tour drives the tab so each step's real surface is behind the card.
  useEffect(() => {
    if (tourStep !== null) { setTab(TOUR_STEPS[tourStep].tab); setSelectedRunId(null); }
  }, [tourStep]);

  if (authError) {
    return (
      <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-xs text-[#e0533d] mb-4">You don&apos;t have access to this project.</p>
          <a href="/dashboard" className="font-mono text-xs text-[#9a91ad] hover:text-[#e9e4f0] underline">← back to dashboard</a>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] flex items-center justify-center">
        <p className="font-mono text-xs text-[#7c7291]">loading…</p>
      </main>
    );
  }

  const degradingCount = viewHealth.filter(s => s.status !== 'healthy').length;
  const proposedCount = viewContracts.filter(c => c.status === 'proposed').length;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'overview' },
    { id: 'logs',      label: 'logs' },
    { id: 'runs',      label: `runs${runs.length ? ` (${runs.length})` : ''}` },
    { id: 'anomalies', label: `detections${viewIncidents.length ? ` (${viewIncidents.length} incident${viewIncidents.length > 1 ? 's' : ''})` : criticalCount ? ` (${criticalCount} critical)` : anomalyRuns.length ? ` (${anomalyRuns.length})` : ''}` },
    { id: 'steps',     label: `steps${(degradingCount + proposedCount) ? ` (${degradingCount + proposedCount})` : ''}` },
    { id: 'usage',     label: 'usage' },
    { id: 'settings',  label: 'settings' },
  ];

  return (
    <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased">

      {/* Top bar */}
      <div className="border-b border-[#3a2f4e] px-4 sm:px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-xs">
              <a href="/dashboard" className="text-[#9a91ad] hover:text-[#e9e4f0] transition-colors shrink-0">projects</a>
              <span className="text-[#7c7291]">/</span>
              <span className="text-[#e9e4f0] font-bold truncate">{project.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={[
                'w-1.5 h-1.5 rounded-full shrink-0',
                status === 'connected'  ? 'bg-[#7fb59a]' : '',
                status === 'connecting' ? 'bg-[#d9a441] animate-pulse' : '',
                status === 'error'      ? 'bg-[#e0533d]' : '',
              ].join(' ')} />
              <span className="font-mono text-[10px] text-[#7c7291]">
                {status === 'connected' ? 'live' : status === 'connecting' ? 'connecting…' : 'realtime error'}
              </span>
            </div>
          </div>
          <code className="hidden sm:block font-mono text-[11px] text-[#7fb59a] border border-[#3a2f4e] px-3 py-1.5 max-w-[200px] truncate shrink-0">
            {project.API_KEY}
          </code>
        </div>

        {/* Tab bar */}
        <div className="max-w-6xl mx-auto flex gap-0 mt-4 overflow-x-auto scrollbar-none -mb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedRunId(null); }}
              className={[
                'px-4 py-2 font-mono text-xs border-b-2 transition-colors whitespace-nowrap shrink-0',
                tab === t.id
                  ? 'border-[#b794f4] text-[#c4a6f2]'
                  : 'border-transparent text-[#9a91ad] hover:text-[#c9c2d6]',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6">

        {tab === 'overview'  && (hasData || demoMode
          ? <OverviewTab calls={viewCalls} openIncidents={viewIncidents.filter(i => i.status === 'open').length} drifting={viewHealth.filter(s => s.status === 'degrading' || s.status === 'critical').length} shapes={proposedCount} critical={criticalCount} onNavigate={setTab} />
          : <FirstRun apiKey={project.API_KEY} connected={status === 'connected'} onImport={() => setTab('settings')} />)}

        {tab === 'logs' && (() => {
          const q = logsQuery.toLowerCase();
          const filtered = viewCalls.filter(c =>
            !q || (c.step_name ?? '').toLowerCase().includes(q) || (c.model ?? '').toLowerCase().includes(q) ||
            (c.run_id ?? '').toLowerCase().includes(q) || (c.error ?? '').toLowerCase().includes(q)
          );
          return viewCalls.length === 0
            ? <EmptyState text="No calls yet — run your first trace to see logs here." />
            : (
              <div>
                <SearchInput value={logsQuery} onChange={setLogsQuery} placeholder="Filter by step, model, run ID, error…" />
                {filtered.length === 0
                  ? <EmptyState text="No calls match that filter." />
                  : <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">{filtered.map((c) => <CallRow key={`${c.id}`} call={c} anomaly={c.run_id ? anomalyMap.get(c.run_id) : undefined} onSelect={setSelectedCall} />)}</div>
                }
              </div>
            );
        })()}

        {tab === 'runs' && !selectedRunId && (() => {
          const q = runsQuery.toLowerCase();
          const filtered = runs.filter(r =>
            !q || r.runId.toLowerCase().includes(q) ||
            r.steps.some(s => (s.step_name ?? '').toLowerCase().includes(q) || (s.model ?? '').toLowerCase().includes(q))
          );
          return runs.length === 0
            ? <EmptyState text="No runs yet." />
            : (
              <div>
                <SearchInput value={runsQuery} onChange={setRunsQuery} placeholder="Filter by run ID, step name, model…" />
                {filtered.length === 0
                  ? <EmptyState text="No runs match that filter." />
                  : <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">{filtered.map((r) => <RunCard key={r.runId} run={r} anomaly={anomalyMap.get(r.runId)} onClick={() => setSelectedRunId(r.runId)} />)}</div>
                }
              </div>
            );
        })()}

        {tab === 'runs' && selectedRunId && selectedRun && (
          <div>
            <button
              onClick={() => { setSelectedRunId(null); setAnalysis(null); }}
              className="font-mono text-xs text-[#9a91ad] hover:text-[#e9e4f0] mb-6 transition-colors flex items-center gap-1.5"
            >
              ← runs
            </button>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1">Run ID</p>
                <code className="font-mono text-xs text-[#c9c2d6] break-all">{selectedRun.runId}</code>
                <div className="flex flex-wrap gap-4 mt-2 font-mono text-[11px] text-[#9a91ad]">
                  <span>{selectedRun.steps.length} steps</span>
                  <span>${selectedRun.totalCost.toFixed(6)}</span>
                  <span>{selectedRun.totalLatency}ms total</span>
                  {selectedRun.errorCount > 0 && <span className="text-[#e0533d]">{selectedRun.errorCount} error{selectedRun.errorCount > 1 ? 's' : ''}</span>}
                </div>
              </div>
              <button
                onClick={() => analyzeRun(selectedRun.runId)}
                disabled={analyzing}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs border border-[#b794f4]/50 text-[#c4a6f2] hover:bg-[#b794f4]/12 hover:border-[#b794f4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {analyzing ? <><span className="animate-spin text-[10px]">◌</span> analyzing…</> : <>✦ analyze run</>}
              </button>
            </div>

            {analysis && analysis.runId === selectedRun.runId && (
              <AnalysisPanel text={analysis.text} costUsd={analysis.costUsd} onClose={() => setAnalysis(null)} />
            )}

            <RunTimeline steps={selectedRun.steps} anomalyRun={anomalyMap.get(selectedRun.runId)} registry={conditionRegistry} onSelect={setSelectedCall} />
          </div>
        )}

        {tab === 'anomalies' && <DetectionsTab incidents={viewIncidents} anomalies={viewAnomalies} runs={anomalyRuns} registry={conditionRegistry} apiKey={project.API_KEY} calls={viewCalls} onSelectCall={setSelectedCall} />}
        {tab === 'steps'     && <StepsTab health={viewHealth} contracts={viewContracts} apiKey={project.API_KEY} onContractUpdate={(id, status) => setContracts(cs => cs.map(c => c.step_profile_id === id ? { ...c, status } : c))} />}
        {tab === 'usage'     && <UsageTab project={project} />}
        {tab === 'settings'  && <SettingsTab project={project} />}

      </div>

      {selectedCall && (
        <CallDetailDrawer
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
          anomalyStep={(() => {
            const ar = anomalyMap.get(selectedCall.run_id ?? '');
            return ar?.steps.find(s => s.step_name === selectedCall.step_name);
          })()}
          runCritical={anomalyMap.get(selectedCall.run_id ?? '')?.is_critical ?? false}
          registry={conditionRegistry}
        />
      )}

      {tourStep !== null && (
        <TourOverlay
          step={TOUR_STEPS[tourStep]}
          index={tourStep}
          total={TOUR_STEPS.length}
          onBack={() => setTourStep(s => (s === null ? null : Math.max(0, s - 1)))}
          onNext={() => setTourStep(s => {
            if (s === null) return null;
            if (s >= TOUR_STEPS.length - 1) { localStorage.setItem('cernova_tour_seen', '1'); return null; }
            return s + 1;
          })}
          onSkip={() => { localStorage.setItem('cernova_tour_seen', '1'); setTourStep(null); }}
        />
      )}
    </main>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ calls, openIncidents, drifting, shapes, critical, onNavigate }: {
  calls: Call[];
  openIncidents: number;
  drifting: number;
  shapes: number;
  critical: number;
  onNavigate: (tab: Tab) => void;
}) {
  const [range, setRange] = useState<TimeRange>('24h');
  const cfg = RANGES[range];
  const allClear = openIncidents === 0 && critical === 0 && drifting === 0 && shapes === 0;
  const chip = 'font-mono text-[11px] px-3 py-1.5 border transition-colors';

  const fc = useMemo(() => {
    const cutoff = Date.now() - cfg.hours * 3_600_000;
    return calls.filter((c) => c.created_at ? new Date(c.created_at).getTime() >= cutoff : false);
  }, [calls, cfg.hours]);

  const filteredRuns = useMemo(() => groupIntoRuns(fc), [fc]);
  const totalCost    = fc.reduce((s, c) => s + (c.cost ?? 0), 0);
  const totalTokens  = fc.reduce((s, c) => s + (c.total_tokens ?? 0), 0);
  const errorCount   = fc.filter((c) => c.status_success === false).length;
  const avgLatency   = fc.length ? Math.round(fc.reduce((s, c) => s + (c.latency_ms ?? 0), 0) / fc.length) : 0;
  const errorRate    = fc.length ? (errorCount / fc.length) * 100 : 0;
  const buckets      = useMemo(() => timeBuckets(fc, cfg.buckets, cfg.hours), [fc, cfg]);

  const modelCounts: Record<string, { calls: number; cost: number }> = {};
  for (const c of fc) {
    if (!c.model) continue;
    if (!modelCounts[c.model]) modelCounts[c.model] = { calls: 0, cost: 0 };
    modelCounts[c.model].calls++;
    modelCounts[c.model].cost += c.cost ?? 0;
  }
  const models = Object.entries(modelCounts).sort((a, b) => b[1].calls - a[1].calls);
  const totalModelCalls = models.reduce((s, [, v]) => s + v.calls, 0);

  const firstLabel = buckets[0]?.label;
  const lastLabel  = buckets[buckets.length - 1]?.label;

  const rangeOptions = (Object.keys(RANGES) as TimeRange[]).map(r => ({ value: r, label: RANGES[r].label }));

  return (
    <div className="space-y-6">

      {/* Detection status — the verdict, before the metrics */}
      {allClear ? (
        <div className="bg-[#281f38] border border-[#3a2f4e] border-l-2 border-[#7fb59a] px-5 py-4">
          <p className="font-sans font-black text-sm text-[#7fb59a]">✓ All clear</p>
          <p className="font-mono text-[11px] text-[#9a91ad] mt-1">No incidents, no drifting steps, nothing waiting on you — Cernova is watching.</p>
        </div>
      ) : (
        <div className="bg-[#281f38] border border-[#3a2f4e] border-l-2 border-[#e0533d] px-5 py-4">
          <p className="font-sans font-black text-sm text-[#e9e4f0] mb-3">Needs your attention</p>
          <div className="flex flex-wrap gap-2">
            {openIncidents > 0 && (
              <button onClick={() => onNavigate('anomalies')} className={`${chip} border-[#e0533d]/50 text-[#e0533d] hover:bg-[#e0533d]/12 hover:border-[#e0533d]`}>🚨 {openIncidents} open incident{openIncidents > 1 ? 's' : ''}</button>
            )}
            {critical > 0 && (
              <button onClick={() => onNavigate('anomalies')} className={`${chip} border-[#e0533d]/50 text-[#e0533d] hover:bg-[#e0533d]/12 hover:border-[#e0533d]`}>{critical} critical run{critical > 1 ? 's' : ''}</button>
            )}
            {drifting > 0 && (
              <button onClick={() => onNavigate('steps')} className={`${chip} border-[#d9c964]/50 text-[#d9c964] hover:bg-[#d9c964]/12 hover:border-[#d9c964]`}>{drifting} step{drifting > 1 ? 's' : ''} drifting</button>
            )}
            {shapes > 0 && (
              <button onClick={() => onNavigate('steps')} className={`${chip} border-[#b794f4]/50 text-[#c4a6f2] hover:bg-[#b794f4]/12 hover:border-[#b794f4]`}>{shapes} output shape{shapes > 1 ? 's' : ''} to review</button>
            )}
          </div>
        </div>
      )}

      {/* Traffic & cost — the secondary, passive metrics */}
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">Traffic &amp; cost</p>
        <SegmentedControl options={rangeOptions} value={range} onChange={setRange} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[#3a2f4e]">
        <StatCard label="Runs"        value={filteredRuns.length.toString()} />
        <StatCard label="Calls"       value={fc.length.toString()} />
        <StatCard label="Total cost"  value={`$${totalCost.toFixed(4)}`} mono />
        <StatCard label="Avg latency" value={fc.length ? `${avgLatency}ms` : '—'} />
        <StatCard label="Error rate"  value={fc.length ? `${errorRate.toFixed(1)}%` : '—'} alert={errorRate > 5} />
        <StatCard label="Tokens"      value={totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString()} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#281f38] border border-[#3a2f4e] p-5">
          <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-4">Calls · {cfg.label}</p>
          <BarChart data={buckets.map(b => b.calls)} color="bg-[#b794f4]" />
          <ChartAxis first={firstLabel} last={lastLabel} />
        </div>
        <div className="bg-[#281f38] border border-[#3a2f4e] p-5">
          <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-4">Models</p>
          {models.length === 0 ? (
            <p className="font-mono text-xs text-[#7c7291] mt-8 text-center">no data</p>
          ) : (
            <div className="space-y-4">
              {models.map(([model, { calls: cnt, cost }]) => (
                <div key={model}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="font-mono text-[11px] text-[#b3abc4] truncate max-w-[140px]">{model.replace('claude-', '')}</span>
                    <span className="font-mono text-[11px] text-[#9a91ad] shrink-0 ml-2">{cnt} · ${cost.toFixed(4)}</span>
                  </div>
                  <div className="h-px bg-[#3a2f4e]">
                    <div className="h-full bg-[#b794f4]" style={{ width: `${(cnt / totalModelCalls) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#281f38] border border-[#3a2f4e] p-5">
          <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-4">Cost · {cfg.label}</p>
          <BarChart data={buckets.map(b => b.cost)} color="bg-[#b794f4]" />
          <ChartAxis first={firstLabel} last={lastLabel} />
        </div>
        <div className="bg-[#281f38] border border-[#3a2f4e] p-5">
          <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-4">Tokens · {cfg.label}</p>
          <BarChart data={buckets.map(b => b.tokens)} color="bg-[#b794f4]" />
          <ChartAxis first={firstLabel} last={lastLabel} />
        </div>
      </div>

      <StepBreakdown calls={fc} />

      {errorCount > 0 && (
        <div className="border-l-2 border-[#e0533d] pl-5 py-3">
          <p className="font-mono text-[10px] text-[#e0533d] uppercase tracking-widest mb-3">Recent errors</p>
          <div className="space-y-2">
            {fc.filter((c) => c.status_success === false).slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-start gap-3 font-mono text-[11px]">
                <span className="text-[#e0533d] shrink-0">✕</span>
                <span className="text-[#b3abc4] shrink-0">{c.step_name ?? '—'}</span>
                <span className="text-[#e0533d] truncate">{c.error ?? 'unknown error'}</span>
                <span className="text-[#7c7291] shrink-0 ml-auto">
                  {c.created_at ? new Date(c.created_at).toLocaleTimeString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function BarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-px h-20">
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 ${color} transition-all opacity-80`}
          style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? '2px' : '0' }}
        />
      ))}
    </div>
  );
}

function ChartAxis({ first, last }: { first?: Date; last?: Date }) {
  const fmt = (d?: Date) => d?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '';
  return (
    <div className="flex justify-between mt-2">
      <span className="font-mono text-[10px] text-[#7c7291]">{fmt(first)}</span>
      <span className="font-mono text-[10px] text-[#7c7291]">{fmt(last)}</span>
    </div>
  );
}

// ── Call log row ──────────────────────────────────────────────────────────────

function CallRow({ call, anomaly, onSelect }: { call: Call; anomaly?: AnomalyRun; onSelect: (c: Call) => void }) {
  const isError = call.status_success === false;
  return (
    <div
      onClick={() => onSelect(call)}
      className={[
        'border-l-2 px-4 py-3 font-mono text-xs grid grid-cols-[1fr_auto] gap-x-4 cursor-pointer hover:bg-[#2d2440] transition-colors',
        isError          ? 'border-[#e0533d]'
          : anomaly?.is_critical ? 'border-[#e0533d]/50'
          : anomaly              ? 'border-[#d9c964]/60'
          : 'border-[#3a2f4e]',
      ].join(' ')}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={isError ? 'error' : 'ok'}>{isError ? 'error' : 'ok'}</Badge>
          {anomaly && (
            <Badge variant={anomaly.is_critical ? 'critical' : 'warning'}>
              {anomaly.is_critical ? `critical ${anomaly.total_score}pts` : `warn ${anomaly.total_score}pts`}
            </Badge>
          )}
          <span className="text-[#c9c2d6] font-bold">{call.step_name ?? '—'}</span>
          <span className="text-[#9a91ad]">{call.model ?? ''}</span>
          {call.step_index != null && <span className="text-[#7c7291]">#{call.step_index + 1}</span>}
        </div>
        {isError && call.error && <div className="text-[#e0533d] truncate">{call.error}</div>}
        {!isError && (
          <div className="flex flex-wrap gap-x-4 text-[#9a91ad]">
            <span><span className="text-[#7c7291]">tokens </span>{call.input_tokens ?? 0} / {call.output_tokens ?? 0}</span>
            {call.cost != null && <span><span className="text-[#7c7291]">cost </span>${Number(call.cost).toFixed(6)}</span>}
          </div>
        )}
        <div className="text-[#7c7291] truncate">run {call.run_id ?? '—'}</div>
      </div>
      <div className="text-right whitespace-nowrap">
        {call.latency_ms != null && <div className="text-[#c9c2d6]">{call.latency_ms}ms</div>}
        {call.created_at && <div className="text-[#7c7291] text-[10px]">{new Date(call.created_at).toLocaleTimeString()}</div>}
      </div>
    </div>
  );
}

// ── Run card ──────────────────────────────────────────────────────────────────

function RunCard({ run, anomaly, onClick }: { run: Run; anomaly?: AnomalyRun; onClick: () => void }) {
  const hasError = run.errorCount > 0;
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left px-5 py-4 border-l-2 hover:bg-[#2d2440] transition-colors',
        anomaly?.is_critical ? 'border-[#e0533d]'
          : anomaly ? 'border-[#d9c964]'
          : hasError ? 'border-[#e0533d]/50'
          : 'border-[#3a2f4e]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={hasError ? 'error' : 'ok'}>{hasError ? `${run.errorCount} err` : 'ok'}</Badge>
            {anomaly && (
              <Badge variant={anomaly.is_critical ? 'critical' : 'warning'}>
                {anomaly.is_critical ? `critical ${anomaly.total_score}pts` : `warn ${anomaly.total_score}pts`}
              </Badge>
            )}
            <code className="font-mono text-[11px] text-[#b3abc4]">{run.runId.slice(0, 16)}…</code>
          </div>
          <div className="flex flex-wrap gap-x-4 font-mono text-[11px] text-[#9a91ad]">
            <span>{run.steps.length} step{run.steps.length !== 1 ? 's' : ''}</span>
            <span>${run.totalCost.toFixed(6)}</span>
            <span>{run.totalLatency}ms</span>
            <span>{run.totalTokens.toLocaleString()} tok</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {run.steps.map((s) => (
              <span key={s.id} className="font-mono text-[10px] bg-[#332946] text-[#9a91ad] px-1.5 py-0.5">
                {s.step_name ?? `step_${(s.step_index ?? 0) + 1}`}
              </span>
            ))}
          </div>
        </div>
        <div className="font-mono text-[11px] text-[#7c7291] ml-6 shrink-0">
          {run.createdAt && new Date(run.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </button>
  );
}

// ── Run timeline ──────────────────────────────────────────────────────────────

function RunTimeline({ steps, anomalyRun, registry, onSelect }: {
  steps: Call[];
  anomalyRun?: AnomalyRun;
  registry?: ConditionRegistry;
  onSelect: (c: Call) => void;
}) {
  if (!steps.length) return null;

  // Severity is a run-level verdict: red only when the run crossed the threshold,
  // so the detail never contradicts the list badge.
  const runCritical = anomalyRun?.is_critical ?? false;

  function fmtMs(ms: number) {
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  }

  const stepsWithTime = steps.map(step => {
    const endMs   = step.created_at ? new Date(step.created_at).getTime() : 0;
    const startMs = endMs - (step.latency_ms ?? 0);
    return { step, startMs, endMs };
  });

  const runStart = Math.min(...stepsWithTime.map(s => s.startMs));
  const runEnd   = Math.max(...stepsWithTime.map(s => s.endMs));
  const totalMs  = Math.max(runEnd - runStart, 1);

  return (
    <div className="w-full space-y-2">
      <div className="flex font-mono text-[10px] text-[#7c7291] pl-44 mb-1 justify-between pr-1">
        <span>0</span>
        <span>{fmtMs(totalMs / 2)}</span>
        <span>{fmtMs(totalMs)}</span>
      </div>

      {stepsWithTime.map(({ step, startMs, endMs }, i) => {
        const anomalyStep = anomalyRun?.steps.find(s => s.step_name === step.step_name);
        const isError   = step.status_success === false;
        const stepScore = anomalyStep?.codes.reduce((s, c) => s + c.score, 0) ?? 0;
        const leftPct   = ((startMs - runStart) / totalMs) * 100;
        const widthPct  = Math.max(((endMs - startMs) / totalMs) * 100, 1.5);

        const barColor = isError ? 'bg-[#e0533d]'
          : (anomalyStep && runCritical) ? 'bg-[#e0533d]/70'
          : anomalyStep    ? 'bg-[#d9c964]/80'
          : 'bg-[#b794f4]';

        return (
          <div key={step.id ?? i} onClick={() => onSelect(step)} className="flex items-center gap-3 group cursor-pointer">
            <div className="w-44 shrink-0 text-right pr-1 space-y-0.5">
              <div className="flex items-center justify-end gap-1.5 min-w-0">
                <Badge variant={isError ? 'error' : anomalyStep ? 'warning' : 'ok'}>
                  {isError ? 'err' : anomalyStep ? `${stepScore}pt` : 'ok'}
                </Badge>
                <span className="font-mono text-[11px] text-[#c9c2d6] truncate">{step.step_name ?? `step_${i + 1}`}</span>
              </div>
              <div className="font-mono text-[10px] text-[#7c7291]">
                {step.latency_ms != null ? fmtMs(step.latency_ms) : '—'}
              </div>
            </div>

            <div className={[
              'flex-1 h-8 border border-[#3a2f4e] relative overflow-hidden transition-colors',
              'group-hover:border-[#4a3d63]',
            ].join(' ')}>
              <div
                className={`absolute top-1.5 bottom-1.5 ${barColor}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
              {widthPct > 12 && step.latency_ms != null && (
                <span
                  className="absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-[#e9e4f0]/70 px-2 pointer-events-none"
                  style={{ left: `${leftPct}%` }}
                >
                  {fmtMs(step.latency_ms)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {anomalyRun && anomalyRun.steps.some(s => s.codes.length > 0) && (
        <div className="pl-44 mt-3 flex flex-wrap gap-1.5">
          {anomalyRun.steps.flatMap(s =>
            s.codes.map(({ code, score }) => {
              const info = registry?.[String(code)];
              return (
                <span
                  key={`${s.step_name}-${code}`}
                  title={info?.description}
                  className={[
                    'inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border',
                    runCritical
                      ? 'border-[#e0533d]/50 text-[#e0533d]'
                      : 'border-[#d9c964]/40 text-[#d9c964]',
                  ].join(' ')}
                >
                  <span className="text-[#9a91ad]">{code}</span>
                  {info && <span>{info.name}</span>}
                  <span>+{score}</span>
                </span>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Call detail drawer ────────────────────────────────────────────────────────

interface ParsedPrompt {
  system?: string;
  messages?: Array<{ role: string; content: string }>;
}

type AnomalyStep = AnomalyRun['steps'][number];

function CallDetailDrawer({ call, onClose, anomalyStep, runCritical, registry }: {
  call: Call;
  onClose: () => void;
  anomalyStep?: AnomalyStep;
  runCritical?: boolean;
  registry?: ConditionRegistry;
}) {
  const isError = call.status_success === false;
  let parsed: ParsedPrompt = {};
  try { if (call.prompt) parsed = JSON.parse(call.prompt); } catch {}

  return (
    <>
      <div className="fixed inset-0 bg-[#201a2b]/60 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[520px] bg-[#281f38] border-l border-[#3a2f4e] z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3a2f4e] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant={isError ? 'error' : 'ok'}>{isError ? 'error' : 'ok'}</Badge>
            <span className="font-sans font-bold text-sm text-[#e9e4f0] truncate">{call.step_name ?? '—'}</span>
            {call.step_index != null && <span className="font-mono text-[10px] text-[#7c7291] shrink-0">#{call.step_index + 1}</span>}
          </div>
          <button onClick={onClose} className="font-mono text-[#9a91ad] hover:text-[#e9e4f0] text-xl leading-none ml-4 shrink-0">×</button>
        </div>

        {/* Meta strip */}
        <div className="px-5 py-3 border-b border-[#3a2f4e] shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px]">
            <span className="text-[#7c7291]">model <span className="text-[#b3abc4]">{call.model ?? '—'}</span></span>
            <span className="text-[#7c7291]">latency <span className="text-[#b3abc4]">{call.latency_ms != null ? `${call.latency_ms}ms` : '—'}</span></span>
            <span className="text-[#7c7291]">cost <span className="text-[#b3abc4]">${Number(call.cost ?? 0).toFixed(6)}</span></span>
            <span className="text-[#7c7291]">tokens <span className="text-[#b3abc4]">{call.input_tokens ?? 0} in / {call.output_tokens ?? 0} out</span></span>
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-[#7c7291] truncate">
            run {call.run_id ?? '—'}
            {call.created_at && <span className="ml-3">{new Date(call.created_at).toLocaleString()}</span>}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {parsed.system && (
            <section>
              <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">System</p>
              <div className="border-l-2 border-[#3a2f4e] pl-4 py-1">
                <pre className="font-mono text-[11px] text-[#b3abc4] whitespace-pre-wrap leading-5">{parsed.system}</pre>
              </div>
            </section>
          )}

          {parsed.messages && parsed.messages.length > 0 && (
            <section>
              <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">Messages</p>
              <div className="space-y-2">
                {parsed.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={[
                      'border-l-2 pl-4 py-2',
                      msg.role === 'user' ? 'border-[#3a2f4e]' : 'border-[#b794f4]',
                    ].join(' ')}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider mb-1 text-[#7c7291]">{msg.role}</p>
                    <p className="font-mono text-[11px] text-[#c9c2d6] whitespace-pre-wrap leading-5">{msg.content}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {call.output_code && (
            <section>
              <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">Output</p>
              <div className="border-l-2 border-[#7fb59a]/60 pl-4 py-1">
                <pre className="font-mono text-[11px] text-[#9ec9b0] whitespace-pre-wrap leading-5">{call.output_code}</pre>
              </div>
            </section>
          )}

          {isError && call.error && (
            <section>
              <p className="font-mono text-[10px] text-[#e0533d] uppercase tracking-widest mb-2">Error</p>
              <div className="border-l-2 border-[#e0533d] pl-4 py-1">
                <pre className="font-mono text-[11px] text-[#e0533d] leading-5 whitespace-pre-wrap">{call.error}</pre>
              </div>
            </section>
          )}

          {anomalyStep && anomalyStep.codes.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-[10px] text-[#d9c964] uppercase tracking-widest">Anomaly conditions</p>
                <span className="font-mono text-[10px] text-[#7c7291]">
                  {anomalyStep.codes.reduce((s, c) => s + c.score, 0)} pts total
                </span>
              </div>
              <div className="space-y-2">
                {anomalyStep.codes.map(({ code, score }) => {
                  const info = registry?.[String(code)];
                  const isCritical = runCritical ?? false;
                  return (
                    <div
                      key={code}
                      className={`border-l-2 pl-4 py-2 ${isCritical ? 'border-[#e0533d]' : 'border-[#d9c964]'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-[#9a91ad]">{code}</span>
                        <span className={`font-mono text-[11px] font-bold ${isCritical ? 'text-[#e0533d]' : 'text-[#e6d77f]'}`}>
                          {info?.name ?? `code_${code}`}
                        </span>
                        <span className={`font-mono text-[10px] ml-auto shrink-0 ${isCritical ? 'text-[#e0533d]' : 'text-[#d9c964]'}`}>
                          +{score}pts
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-[#9a91ad] leading-5">{info?.description ?? '—'}</p>
                      {info?.layer && <p className="font-mono text-[10px] text-[#7c7291] mt-0.5">{info.layer}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// ── Step breakdown ────────────────────────────────────────────────────────────

function StepBreakdown({ calls }: { calls: Call[] }) {
  if (!calls.length) return null;

  const byStep = new Map<string, { latencies: number[]; errors: number; costs: number[]; total: number }>();
  for (const c of calls) {
    const name = c.step_name ?? 'unknown';
    if (!byStep.has(name)) byStep.set(name, { latencies: [], errors: 0, costs: [], total: 0 });
    const s = byStep.get(name)!;
    s.total++;
    if (c.latency_ms != null) s.latencies.push(c.latency_ms);
    if (c.status_success === false) s.errors++;
    if (c.cost != null) s.costs.push(c.cost);
  }

  const rows = Array.from(byStep.entries()).map(([name, { latencies, errors, costs, total }]) => {
    const sorted  = [...latencies].sort((a, b) => a - b);
    const p95     = sorted.length ? sorted[Math.min(Math.ceil(sorted.length * 0.95) - 1, sorted.length - 1)] : 0;
    const avg     = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
    return { name, total, avg, p95, errors, errorRate: total > 0 ? (errors / total) * 100 : 0, avgCost };
  }).sort((a, b) => b.total - a.total);

  if (!rows.length) return null;
  const maxAvg = Math.max(...rows.map(r => r.avg), 1);

  return (
    <div className="bg-[#281f38] border border-[#3a2f4e] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#3a2f4e]">
        <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">Steps</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-[11px]">
          <thead>
            <tr className="border-b border-[#3a2f4e]">
              <th className="text-left px-5 py-2.5 text-[#7c7291] font-normal">step</th>
              <th className="text-right px-4 py-2.5 text-[#7c7291] font-normal">calls</th>
              <th className="px-4 py-2.5 text-[#7c7291] font-normal w-40">avg latency</th>
              <th className="text-right px-4 py-2.5 text-[#7c7291] font-normal">p95</th>
              <th className="text-right px-4 py-2.5 text-[#7c7291] font-normal">errors</th>
              <th className="text-right px-5 py-2.5 text-[#7c7291] font-normal">avg cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#332946]">
            {rows.map(row => (
              <tr key={row.name} className="hover:bg-[#2d2440] transition-colors">
                <td className="px-5 py-3 text-[#c9c2d6]">{row.name}</td>
                <td className="px-4 py-3 text-[#9a91ad] text-right tabular-nums">{row.total}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-[#3a2f4e]">
                      <div className="h-full bg-[#b794f4]/60" style={{ width: `${(row.avg / maxAvg) * 100}%` }} />
                    </div>
                    <span className="text-[#b3abc4] tabular-nums w-16 text-right shrink-0">{row.avg}ms</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#9a91ad] text-right tabular-nums">{row.p95}ms</td>
                <td className={`px-4 py-3 text-right tabular-nums ${row.errors > 0 ? 'text-[#e0533d]' : 'text-[#6b6180]'}`}>
                  {row.errors > 0 ? `${row.errorRate.toFixed(1)}%` : '—'}
                </td>
                <td className="px-5 py-3 text-[#9a91ad] text-right tabular-nums">${row.avgCost.toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AI analysis panel ─────────────────────────────────────────────────────────

function AnalysisPanel({ text, costUsd, onClose }: { text: string; costUsd: number; onClose: () => void }) {
  const lines = text.split('\n');
  return (
    <div className="mb-6 bg-[#281f38] border border-[#3a2f4e] border-l-2 border-l-[#b794f4] px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[#b794f4] text-sm">✦</span>
          <span className="font-mono text-[10px] text-[#b794f4] uppercase tracking-widest">AI Analysis</span>
          <span className="font-mono text-[10px] text-[#7c7291]">claude-sonnet-4-6 · ${costUsd.toFixed(5)}</span>
        </div>
        <button onClick={onClose} className="font-mono text-[#9a91ad] hover:text-[#c9c2d6] text-sm leading-none">×</button>
      </div>
      <div className="space-y-1">
        {lines.map((line, i) => {
          if (!line.trim()) return <div key={i} className="h-2" />;
          const isBold = line.startsWith('**') && line.endsWith('**');
          const clean = isBold ? line.slice(2, -2) : line.replace(/\*\*(.*?)\*\*/g, '$1');
          return isBold
            ? <p key={i} className="font-mono text-[10px] text-[#c4a6f2] uppercase tracking-widest mt-4 first:mt-0">{clean}</p>
            : <p key={i} className={`font-mono text-[11px] leading-5 ${line.startsWith('- ') ? 'pl-3 text-[#9a91ad]' : 'text-[#b3abc4]'}`}>{clean}</p>;
        })}
      </div>
    </div>
  );
}

// ── Detections tab (incidents · frequency · anomaly feed) ─────────────────────

function anomalyFreqBuckets(rows: AnomalyRow[], bucketCount: number, hours: number) {
  const now = Date.now();
  const windowMs = hours * 3600_000;
  const bucketMs = windowMs / bucketCount;
  const start = now - windowMs;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({ label: new Date(start + i * bucketMs), count: 0 }));
  for (const r of rows) {
    if (!r.created_at) continue;
    const idx = Math.floor((new Date(r.created_at).getTime() - start) / bucketMs);
    if (idx >= 0 && idx < bucketCount) buckets[idx].count++;
  }
  return buckets;
}

// Single-series frequency bars (brand purple = volume, consistent with Overview).
// Severity lives in the incident cards, not the bar colour — status colour is
// never used for a plain magnitude series.
function FreqBars({ buckets }: { buckets: { label: Date; count: number }[] }) {
  const max = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div className="flex items-end gap-px h-24">
      {buckets.map((b, i) => (
        <div
          key={i}
          title={`${b.count} ${b.count === 1 ? 'anomaly' : 'anomalies'} · ${b.label.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          className="flex-1 bg-[#b794f4] opacity-80 hover:opacity-100 transition-all"
          style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count > 0 ? '2px' : '0' }}
        />
      ))}
    </div>
  );
}

function DetectionsTab({ incidents, anomalies, runs, registry, apiKey, calls, onSelectCall }: {
  incidents: Incident[];
  anomalies: AnomalyRow[];
  runs: AnomalyRun[];
  registry: ConditionRegistry;
  apiKey: string;
  calls: Call[];
  onSelectCall: (c: Call) => void;
}) {
  const [range, setRange] = useState<TimeRange>('24h');
  const cfg = RANGES[range];
  const buckets = useMemo(() => {
    const cutoff = Date.now() - cfg.hours * 3600_000;
    const inWindow = anomalies.filter(a => a.created_at && new Date(a.created_at).getTime() >= cutoff);
    return anomalyFreqBuckets(inWindow, cfg.buckets, cfg.hours);
  }, [anomalies, cfg]);
  const rangeOptions = (Object.keys(RANGES) as TimeRange[]).map(r => ({ value: r, label: RANGES[r].label }));
  const criticalCount = runs.filter(r => r.is_critical).length;
  const openIncidents = incidents.filter(i => i.status === 'open');

  return (
    <div className="space-y-6">
      {/* Stat row — the technical-dashboard header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#3a2f4e]">
        <StatCard label="Open incidents" value={openIncidents.length.toString()} alert={openIncidents.length > 0} />
        <StatCard label="Anomaly runs"   value={runs.length.toString()} />
        <StatCard label="Critical"       value={criticalCount.toString()} alert={criticalCount > 0} />
        <StatCard label="Conditions"     value={anomalies.length.toString()} />
      </div>

      {/* Incidents — the macro/systemic signal, hero of the tab */}
      <div>
        <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-3">Systemic incidents</p>
        {openIncidents.length === 0 ? (
          <div className="border-l-2 border-[#3a2f4e] pl-4 py-2">
            <p className="font-mono text-[11px] text-[#7c7291]">
              No systemic incidents — failures are isolated, not hitting many runs at once.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {openIncidents.map((inc) => {
              const name = registry[String(inc.error_code)]?.name ?? `code_${inc.error_code}`;
              return (
                <div key={inc.id} className="border-l-2 border-[#e0533d] bg-[#281f38] border-y border-r border-[#3a2f4e] px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-sans text-sm text-[#e9e4f0]">
                        <span className="text-[#e0533d]">🚨</span>{' '}
                        <span className="font-black text-[#e0533d]">{inc.run_count} runs</span>{' '}
                        of <code className="font-mono text-[12px] text-[#c4a6f2]">{inc.step_name ?? '—'}</code>{' '}
                        hit <span className="font-mono text-[12px] text-[#e6d77f]">{name}</span>
                      </p>
                      <p className="font-mono text-[10px] text-[#7c7291] mt-1">
                        {inc.run_count} distinct runs within {inc.window_min} min · code {inc.error_code}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="critical">incident</Badge>
                      <p className="font-mono text-[10px] text-[#7c7291] mt-1.5">{new Date(inc.opened_at).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Frequency over time — one-off vs. macro trend at a glance */}
      <div className="bg-[#281f38] border border-[#3a2f4e] p-5">
        <div className="flex items-center justify-between mb-4 gap-4">
          <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">Anomaly frequency · {cfg.label}</p>
          <SegmentedControl options={rangeOptions} value={range} onChange={setRange} />
        </div>
        <FreqBars buckets={buckets} />
        <ChartAxis first={buckets[0]?.label} last={buckets[buckets.length - 1]?.label} />
      </div>

      {/* Individual anomalies — the per-run drill-down */}
      <div>
        <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-3">Individual anomalies</p>
        <AnomaliesTab runs={runs} registry={registry} apiKey={apiKey} calls={calls} onSelectCall={onSelectCall} />
      </div>
    </div>
  );
}

// ── Anomalies tab ─────────────────────────────────────────────────────────────

function AnomaliesTab({ runs, registry, apiKey, calls, onSelectCall }: { runs: AnomalyRun[]; registry: ConditionRegistry; apiKey: string; calls: Call[]; onSelectCall: (c: Call) => void }) {
  const callFor = (runId: string, stepName: string) => calls.find(c => c.run_id === runId && c.step_name === stepName);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ runId: string; text: string; costUsd: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [query, setQuery] = useState('');
  const [fbBusy, setFbBusy] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, { verdict: 'confirm' | 'reject'; text: string }>>({});
  const [fbError, setFbError] = useState<{ runId: string; text: string } | null>(null);

  async function anomalyVerdict(runId: string, v: 'confirm' | 'reject') {
    setFbBusy(runId); setFbError(null);
    try {
      const res = await fetch(`${BACKEND}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ subject_type: 'anomaly', subject_id: runId, verdict: v }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      let text = 'Confirmed as a real issue — label recorded.';
      if (v === 'reject') {
        const n = data.applied?.startsWith('baseline_reincluded:') ? Number(data.applied.split(':')[1]) : null;
        text = n != null
          ? `False alarm — ${n} call${n === 1 ? '' : 's'} returned to the baseline.`
          : 'False alarm recorded — baseline update failed, label kept.';
      }
      setVerdicts(vs => ({ ...vs, [runId]: { verdict: v, text } }));
    } catch (e) {
      setFbError({ runId, text: String(e) });
    } finally {
      setFbBusy(null);
    }
  }

  async function analyzeRun(runId: string) {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await authFetch(`${BACKEND}/analyze/run/${runId}`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAnalysis({ runId, text: data.analysis, costUsd: data.cost_usd });
    } catch (e) {
      console.error('[analyze]', e);
    } finally {
      setAnalyzing(false);
    }
  }

  if (runs.length === 0) return <EmptyState text="No anomalies detected yet." />;

  const q = query.toLowerCase();
  const filtered = runs.filter(r =>
    !q || r.run_id.toLowerCase().includes(q) || r.steps.some(s => s.step_name.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-2 max-w-3xl">
      <SearchInput value={query} onChange={setQuery} placeholder="Filter by run ID or step name…" />
      {filtered.length === 0 && <EmptyState text="No anomalies match that filter." />}
      {filtered.map((run) => {
        const isOpen = expanded === run.run_id;
        return (
          <div
            key={run.run_id}
            className={[
              'border-l-2',
              run.is_critical ? 'border-[#e0533d]' : 'border-[#d9c964]',
            ].join(' ')}
          >
            <button
              onClick={() => setExpanded(isOpen ? null : run.run_id)}
              className="w-full flex items-center justify-between gap-4 px-4 py-4 text-left bg-[#281f38] hover:bg-[#2d2440] transition-colors border border-l-0 border-[#3a2f4e]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant={run.is_critical ? 'critical' : 'warning'}>
                  {run.is_critical ? 'critical' : 'warning'}
                </Badge>
                <code className="font-mono text-xs text-[#b3abc4] truncate">{run.run_id}</code>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className={`font-sans font-black text-sm tabular-nums ${run.is_critical ? 'text-[#e0533d]' : 'text-[#d9c964]'}`}>
                  {run.total_score} pts
                </span>
                <span className="font-mono text-[10px] text-[#7c7291]">{new Date(run.latest_at).toLocaleString()}</span>
                <span className="font-mono text-[#7c7291] text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="bg-[#281f38] border border-l-0 border-t-0 border-[#3a2f4e] px-5 py-4 space-y-5">
                {run.steps.map((step) => {
                  const offending = callFor(run.run_id, step.step_name);
                  return (
                  <div key={step.step_name}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-mono text-[10px] text-[#9a91ad] uppercase tracking-widest">{step.step_name}</p>
                      {offending && (
                        <button
                          onClick={() => onSelectCall(offending)}
                          className="font-mono text-[10px] text-[#c4a6f2] hover:text-[#e9e4f0] transition-colors shrink-0"
                        >
                          view output →
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {step.codes.map(({ code, score }) => {
                        const info = registry[String(code)];
                        const isCrit = run.is_critical;
                        return (
                          <div key={code} className={`border-l-2 pl-4 py-1.5 ${isCrit ? 'border-[#e0533d]' : 'border-[#d9c964]'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[10px] text-[#7c7291]">{code}</span>
                              <span className={`font-mono text-[11px] font-bold ${isCrit ? 'text-[#e0533d]' : 'text-[#e6d77f]'}`}>
                                {info?.name ?? `code_${code}`}
                              </span>
                              <span className={`font-mono text-[10px] ml-auto shrink-0 ${isCrit ? 'text-[#e0533d]' : 'text-[#d9c964]'}`}>
                                +{score}pts
                              </span>
                              {info?.layer && <span className="font-mono text-[10px] text-[#7c7291]">{info.layer}</span>}
                            </div>
                            {info?.description && (
                              <p className="font-mono text-[10px] text-[#7c7291] mt-0.5 leading-5">{info.description}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-right font-mono text-[10px] text-[#7c7291] mt-1">
                      step total: {step.codes.reduce((s, c) => s + c.score, 0)} pts
                    </div>
                  </div>
                  );
                })}

                <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-[#3a2f4e]">
                  <span className="font-mono text-[10px] text-[#7c7291]">
                    threshold: {ANOMALY_THRESHOLD} pts — total: <span className={run.is_critical ? 'text-[#e0533d] font-bold' : 'text-[#d9c964]'}>{run.total_score} pts</span>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {verdicts[run.run_id] ? (
                      <span className="font-mono text-[10px] text-[#7fb59a]">{verdicts[run.run_id].text}</span>
                    ) : (
                      <>
                        <button
                          onClick={() => anomalyVerdict(run.run_id, 'confirm')}
                          disabled={fbBusy === run.run_id}
                          className="px-3 py-1.5 font-mono text-[11px] border border-[#7fb59a]/60 text-[#7fb59a] hover:bg-[#7fb59a]/15 hover:border-[#7fb59a] disabled:opacity-40 transition-colors"
                        >
                          ✓ real issue
                        </button>
                        <button
                          onClick={() => anomalyVerdict(run.run_id, 'reject')}
                          disabled={fbBusy === run.run_id}
                          className="px-3 py-1.5 font-mono text-[11px] border border-[#e0533d]/60 text-[#e0533d] hover:bg-[#e0533d]/15 hover:border-[#e0533d] disabled:opacity-40 transition-colors"
                        >
                          {fbBusy === run.run_id ? '…' : '✕ false alarm'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => analyzeRun(run.run_id)}
                      disabled={analyzing}
                      className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] border border-[#b794f4]/50 text-[#c4a6f2] hover:bg-[#b794f4]/12 hover:border-[#b794f4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {analyzing && analysis?.runId !== run.run_id ? <><span className="animate-spin text-[10px]">◌</span> analyzing…</> : <>✦ analyze</>}
                    </button>
                  </div>
                </div>
                {fbError?.runId === run.run_id && (
                  <p className="font-mono text-[10px] text-[#e0533d]">{fbError.text}</p>
                )}
                {analysis && analysis.runId === run.run_id && (
                  <AnalysisPanel text={analysis.text} costUsd={analysis.costUsd} onClose={() => setAnalysis(null)} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Steps health tab ──────────────────────────────────────────────────────────

function StepsTab({ health, contracts, apiKey, onContractUpdate }: {
  health: StepHealthRow[];
  contracts: ContractRow[];
  apiKey: string;
  onContractUpdate: (stepProfileId: string, status: ContractRow['status']) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy]         = useState<string | null>(null);
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  async function verdict(stepProfileId: string, v: 'confirm' | 'reject') {
    setBusy(stepProfileId); setMsg(null);
    try {
      const res = await fetch(`${BACKEND}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ subject_type: 'contract', subject_id: stepProfileId, verdict: v }),
      });
      if (!res.ok) throw new Error(await res.text());
      onContractUpdate(stepProfileId, v === 'confirm' ? 'enforced' : 'rejected');
      setMsg({ ok: true, text: v === 'confirm'
        ? 'Output shape enforced — mismatches now count toward detection.'
        : 'Output shape dismissed — it won’t be suggested again.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  if (health.length === 0) {
    return <EmptyState text="No steps yet — run a trace and Cernova will discover your agent’s steps here." />;
  }

  const contractOf = new Map(contracts.map(c => [c.step_profile_id, c] as const));
  const order = { critical: 0, degrading: 1, warming: 2, healthy: 3 };
  const sorted = [...health].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  const activeCount  = health.filter(s => s.status !== 'warming').length;
  const warmingCount = health.filter(s => s.status === 'warming').length;

  const fmtMetric = (metric: string, value: number) =>
    metric === 'latency_ms' ? `${Math.round(value)}ms`
    : metric === 'cost' ? `$${value.toFixed(5)}`
    : Math.round(value).toLocaleString();
  const metricLabel = (metric: string) =>
    metric === 'latency_ms' ? 'latency' : metric === 'total_tokens' ? 'tokens' : metric;

  return (
    <div className="space-y-2 max-w-3xl">
      <p className="font-mono text-[11px] text-[#9a91ad] leading-6 mb-4 max-w-2xl">
        Cernova splits your agent into <span className="text-[#c9c2d6]">steps</span> and learns two things about each:
        its normal <span className="text-[#c9c2d6]">behavior</span> (latency, cost, tokens) and its expected{' '}
        <span className="text-[#c9c2d6]">output shape</span>. A step is flagged when either drifts — expand one for detail.
      </p>

      <div className="bg-[#281f38] border border-[#3a2f4e] px-5 py-3 flex items-center justify-between gap-4 mb-2">
        <div className="font-mono text-[11px]">
          {activeCount > 0
            ? <span className="text-[#7fb59a]">{activeCount} step{activeCount !== 1 ? 's' : ''} monitored</span>
            : <span className="text-[#7c7291]">no steps monitored yet</span>}
          {warmingCount > 0 && <span className="text-[#7c7291] ml-2">· {warmingCount} still learning</span>}
        </div>
        <span className="font-mono text-[10px] text-[#7c7291] shrink-0">{L5_MIN_SAMPLES} calls per step to start</span>
      </div>

      {msg && <p className={['font-mono text-xs mb-2', msg.ok ? 'text-[#7fb59a]' : 'text-[#e0533d]'].join(' ')}>{msg.text}</p>}

      {sorted.map(row => {
        const c = contractOf.get(row.step_profile_id);
        const isOpen = expanded === row.step_profile_id;
        const isWarming = row.status === 'warming';
        const isCritical = row.status === 'critical';
        const pct = Math.min((row.sample_count / L5_MIN_SAMPLES) * 100, 100);
        const statusLabel = isWarming ? 'learning' : row.status;
        const shape = c && c.status === 'enforced' ? { t: 'output shape enforced', cls: 'text-[#7fb59a]' }
          : c && c.status === 'proposed' ? { t: 'output shape to review', cls: 'text-[#d9c964]' }
          : null;
        const accentBorder = isCritical ? 'border-[#e0533d]'
          : row.status === 'degrading' ? 'border-[#d9c964]'
          : isWarming ? 'border-[#3a2f4e]'
          : 'border-[#7fb59a]';

        return (
          <div key={row.step_profile_id} className={`bg-[#281f38] border border-[#3a2f4e] border-l-2 ${accentBorder}`}>
            <button
              onClick={() => setExpanded(isOpen ? null : row.step_profile_id)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#2d2440] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={['w-1.5 h-1.5 rounded-full shrink-0',
                  isCritical ? 'bg-[#e0533d]' : row.status === 'degrading' ? 'bg-[#d9a441]' : isWarming ? 'bg-[#332946]' : 'bg-[#7fb59a]'].join(' ')} />
                <span className={`font-mono text-sm truncate ${isWarming ? 'text-[#9a91ad]' : 'text-[#c9c2d6]'}`}>{row.step_name}</span>
                <Badge variant={isCritical ? 'critical' : row.status === 'degrading' ? 'warning' : isWarming ? 'neutral' : 'ok'}>{statusLabel}</Badge>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {shape && <span className={`font-mono text-[10px] ${shape.cls} hidden sm:inline`}>{shape.t}</span>}
                <span className="font-mono text-[10px] text-[#7c7291]">{row.sample_count} calls</span>
                <span className="font-mono text-[#7c7291] text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-4 space-y-4 border-t border-[#3a2f4e]">
                {/* BEHAVIOR */}
                <div className="pt-3">
                  <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">behavior</p>
                  {isWarming ? (
                    <div>
                      <div className="flex justify-between font-mono text-[10px] text-[#7c7291] mb-1.5">
                        <span>learning normal behavior — {row.sample_count} / {L5_MIN_SAMPLES} calls</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="h-px bg-[#3a2f4e]"><div className="h-full bg-[#b794f4]/50 transition-all" style={{ width: `${pct}%` }} /></div>
                    </div>
                  ) : row.trends.length > 0 ? (
                    <div className="space-y-2">
                      {row.trends.map(t => {
                        const mult = t.baseline_mean > 0 ? t.recent_mean / t.baseline_mean : null;
                        return (
                          <div key={t.metric} className="flex items-center gap-3 font-mono text-[11px]">
                            <span className="text-[#7c7291] w-16 shrink-0">{metricLabel(t.metric)}</span>
                            <span className="text-[#b3abc4]">{fmtMetric(t.metric, t.baseline_mean)}</span>
                            <span className={t.direction === 'up' ? 'text-[#e0533d]' : 'text-[#7fb59a]'}>→</span>
                            <span className={isCritical ? 'text-[#e0533d]' : 'text-[#e6d77f]'}>{fmtMetric(t.metric, t.recent_mean)}</span>
                            {mult != null && <span className={['ml-auto shrink-0 font-bold', mult >= 2.5 || mult <= 0.4 ? 'text-[#e0533d]' : 'text-[#d9c964]'].join(' ')}>{mult.toFixed(1)}× normal</span>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-[#7fb59a]">Normal — no drift in latency, cost, or tokens.</p>
                  )}
                </div>

                {/* OUTPUT SHAPE */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">output shape</p>
                    {c?.status === 'proposed' && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => verdict(c.step_profile_id, 'confirm')} disabled={busy === c.step_profile_id}
                          className="px-3 py-1 font-mono text-[11px] border border-[#7fb59a]/60 text-[#7fb59a] hover:bg-[#7fb59a]/15 hover:border-[#7fb59a] disabled:opacity-40 transition-colors">
                          {busy === c.step_profile_id ? '…' : '✓ correct'}
                        </button>
                        <button onClick={() => verdict(c.step_profile_id, 'reject')} disabled={busy === c.step_profile_id}
                          className="px-3 py-1 font-mono text-[11px] border border-[#e0533d]/60 text-[#e0533d] hover:bg-[#e0533d]/15 hover:border-[#e0533d] disabled:opacity-40 transition-colors">
                          ✕ not right
                        </button>
                      </div>
                    )}
                  </div>
                  {(() => {
                    if (!c || c.status === 'observing') {
                      return <p className="font-mono text-[11px] text-[#7c7291]">Still learning this step’s output shape (needs {L5_MIN_SAMPLES}+ successful outputs).</p>;
                    }
                    if (c.status === 'rejected') {
                      return <p className="font-mono text-[11px] text-[#7c7291]">Output-shape checks dismissed for this step.</p>;
                    }
                    const specs = c.keys ? Object.values(c.keys) : [];
                    const constraint = (k: KeySpec) =>
                      k.enum_values && k.enum_values.length ? `∈ ${k.enum_values.join(' · ')}`
                      : (k.num_min != null || k.num_max != null) ? `${k.num_min ?? '−∞'} – ${k.num_max ?? '∞'}`
                      : '—';
                    return (
                      <div>
                        <p className="font-mono text-[10px] text-[#7c7291] mb-2">
                          learned from {c.sample_count ?? '—'} outputs · {c.format ?? 'text'}
                          {c.format === 'json' && c.json_rate != null && ` · valid JSON ${Math.round(c.json_rate * 100)}%`}
                          {' · '}
                          {c.status === 'enforced'
                            ? <span className="text-[#7fb59a]">enforced</span>
                            : <span className="text-[#d9c964]">watching — confirm to enforce</span>}
                        </p>
                        {specs.length > 0 ? (
                          <div className="border border-[#3a2f4e] overflow-x-auto">
                            <table className="w-full font-mono text-[10px]">
                              <thead>
                                <tr className="border-b border-[#3a2f4e] text-[#7c7291] text-left uppercase tracking-wider">
                                  <th className="px-3 py-1.5 font-normal">key</th>
                                  <th className="px-3 py-1.5 font-normal">type</th>
                                  <th className="px-3 py-1.5 font-normal">required</th>
                                  <th className="px-3 py-1.5 font-normal">constraints</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...specs].sort((a, b) => {
                                  const ar = c.required_keys.includes(a.name), br = c.required_keys.includes(b.name);
                                  if (ar !== br) return ar ? -1 : 1;
                                  return b.presence - a.presence;
                                }).map((k) => {
                                  const required = c.required_keys.includes(k.name);
                                  return (
                                    <tr key={k.name} className="border-b border-[#3a2f4e]/50 last:border-0">
                                      <td className="px-3 py-1.5 text-[#cdb9f7]">{k.name}</td>
                                      <td className="px-3 py-1.5 text-[#b3abc4]">{k.types.join(' | ') || '—'}</td>
                                      <td className="px-3 py-1.5">{required ? <span className="text-[#7fb59a]">required</span> : <span className="text-[#9a91ad]">{Math.round(k.presence * 100)}%</span>}</td>
                                      <td className="px-3 py-1.5 text-[#9a91ad]">{constraint(k)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : c.required_keys.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {c.required_keys.map((k) => (
                              <span key={k} className="font-mono text-[10px] text-[#cdb9f7] bg-[#b794f4]/18 px-1.5 py-0.5">{k}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="font-mono text-[10px] text-[#7c7291]">Free-form text output — no structural keys.</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Usage tab ─────────────────────────────────────────────────────────────────

function UsageTab({ project }: { project: Project }) {
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
  const [data, setData] = useState<{
    month_cost_usd: number;
    total_cost_usd: number;
    budget_usd: number | null;
    budget_pct: number | null;
    by_feature: Record<string, number>;
    recent: Array<{ id: number; feature: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; created_at: string; run_id: string }>;
  } | null>(null);

  useEffect(() => {
    authFetch(`${BACKEND_URL}/projects/${project.id}/usage`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [project.id, BACKEND_URL]);

  if (!data) return <div className="font-mono text-xs text-[#7c7291] py-8">loading…</div>;

  const budgetPct = data.budget_pct ?? 0;
  const overBudget = data.budget_usd != null && data.month_cost_usd >= data.budget_usd;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#3a2f4e]">
        <StatCard label="This month" value={`$${data.month_cost_usd.toFixed(4)}`} mono />
        <StatCard label="All time"   value={`$${data.total_cost_usd.toFixed(4)}`} mono />
        <div className="border border-[#3a2f4e] px-4 py-4">
          {data.budget_usd != null ? (
            <>
              <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">Budget</p>
              <p className={`font-sans font-black text-xl tabular-nums ${overBudget ? 'text-[#e0533d]' : 'text-[#e9e4f0]'}`}>
                {budgetPct.toFixed(1)}%
              </p>
              <p className="font-mono text-[10px] text-[#7c7291] mt-1">of ${data.budget_usd.toFixed(2)}/mo</p>
              <div className="mt-3 h-px bg-[#3a2f4e]">
                <div
                  className={`h-full transition-all ${overBudget ? 'bg-[#e0533d]' : budgetPct > 80 ? 'bg-[#d9a441]' : 'bg-[#7fb59a]'}`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">Budget</p>
              <p className="font-sans font-black text-xl text-[#6b6180]">—</p>
              <p className="font-mono text-[10px] text-[#7c7291] mt-1">not set</p>
            </>
          )}
        </div>
      </div>

      {Object.keys(data.by_feature).length > 0 && (
        <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">
          <div className="px-4 py-3">
            <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">This month by feature</p>
          </div>
          {Object.entries(data.by_feature).map(([feature, cost]) => (
            <div key={feature} className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-[11px] text-[#9a91ad]">{feature}</span>
              <span className="font-mono text-[11px] text-[#c9c2d6]">${cost.toFixed(4)}</span>
            </div>
          ))}
        </div>
      )}

      {data.recent.length > 0 ? (
        <div className="border border-[#3a2f4e]">
          <div className="px-4 py-3 border-b border-[#3a2f4e]">
            <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">Recent usage</p>
          </div>
          <div className="divide-y divide-[#3a2f4e]">
            {data.recent.map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="font-mono text-[11px] text-[#b3abc4]">{r.feature}</span>
                  <span className="font-mono text-[10px] text-[#7c7291] mx-2">·</span>
                  <span className="font-mono text-[10px] text-[#7c7291]">{r.model}</span>
                  <div className="font-mono text-[10px] text-[#7c7291] mt-0.5">{r.input_tokens + r.output_tokens} tokens · run {r.run_id.slice(0, 8)}…</div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="font-mono text-[11px] text-[#c9c2d6]">${r.cost_usd.toFixed(6)}</div>
                  <div className="font-mono text-[10px] text-[#7c7291]">{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState text="No usage recorded yet — click ✦ Analyze Run on any run to generate a report." />
      )}
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

interface ThresholdData {
  mode: 'static' | 'dynamic';
  calls_used: number;
  calls_needed: number;
  thresholds: { latency_ms_max: number; total_tokens_max: number; cost_max: number };
  baselines?: {
    latency_ms?: { p50: number; p95: number };
    total_tokens?: { p50: number; p95: number };
    cost?: { p50: number; p95: number };
  };
}

function SettingSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="pt-8 border-t border-[#3a2f4e] first:border-t-0 first:pt-0">
      <h2 className="font-sans font-bold text-sm uppercase tracking-widest text-[#e9e4f0] mb-1">{title}</h2>
      {description && <p className="font-mono text-[11px] text-[#9a91ad] mb-5 leading-5">{description}</p>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'bg-[#201a2b] border border-[#3a2f4e] px-3 py-2 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63] w-full';

function ImportSection({ project }: { project: Project }) {
  const [provider, setProvider]   = useState<'langfuse' | 'langsmith'>('langfuse');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [lfHost, setLfHost]       = useState('https://cloud.langfuse.com');
  const [apiKey, setApiKey]       = useState('');
  const [lsHost, setLsHost]       = useState('https://api.smith.langchain.com');
  const [sessions, setSessions]   = useState('');
  const [importing, setImporting] = useState(false);
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  const canImport = provider === 'langfuse'
    ? publicKey.trim() !== '' && secretKey.trim() !== ''
    : apiKey.trim() !== '';

  async function runImport() {
    setImporting(true); setMsg(null);
    try {
      const endpoint = provider === 'langfuse' ? '/import/langfuse' : '/import/langsmith';
      const body = provider === 'langfuse'
        ? { public_key: publicKey.trim(), secret_key: secretKey.trim(), host: lfHost.trim() || undefined }
        : {
            api_key: apiKey.trim(),
            host: lsHost.trim() || undefined,
            session_ids: sessions.trim()
              ? sessions.split(',').map(s => s.trim()).filter(Boolean)
              : undefined,
          };
      const res = await fetch(`${BACKEND}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${project.API_KEY}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(detail || `HTTP ${res.status}`);
      }
      setMsg({ ok: true, text: 'Import started — baselines warm in the background. Check the steps tab shortly.' });
      setPublicKey(''); setSecretKey(''); setApiKey(''); setSessions('');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setImporting(false);
    }
  }

  return (
    <SettingSection
      title="Warm-start import"
      description="Import your existing traces to build per-step baselines from real traffic instead of waiting for live calls. Backdated, deduplicated, and alert-suppressed — re-running is safe."
    >
      <div className="space-y-4">
        <Field label="Source">
          <SegmentedControl
            options={[
              { value: 'langfuse'  as const, label: 'Langfuse' },
              { value: 'langsmith' as const, label: 'LangSmith' },
            ]}
            value={provider}
            onChange={setProvider}
          />
        </Field>

        {provider === 'langfuse' ? (
          <>
            <Field label="Langfuse public key">
              <input type="text" value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder="pk-lf-…" className={inputCls} />
            </Field>
            <Field label="Langfuse secret key">
              <input type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder="sk-lf-…" className={inputCls} />
            </Field>
            <Field label="Host">
              <input type="url" value={lfHost} onChange={e => setLfHost(e.target.value)} placeholder="https://cloud.langfuse.com" className={inputCls} />
            </Field>
          </>
        ) : (
          <>
            <Field label="LangSmith API key">
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="lsv2_…" className={inputCls} />
            </Field>
            <Field label="Host">
              <input type="url" value={lsHost} onChange={e => setLsHost(e.target.value)} placeholder="https://api.smith.langchain.com" className={inputCls} />
            </Field>
            <Field label="Project IDs (optional)">
              <input type="text" value={sessions} onChange={e => setSessions(e.target.value)} placeholder="comma-separated — leave blank to import all projects" className={inputCls} />
            </Field>
          </>
        )}

        {msg && <p className={['font-mono text-xs', msg.ok ? 'text-[#7fb59a]' : 'text-[#e0533d]'].join(' ')}>{msg.text}</p>}
        <button
          onClick={runImport}
          disabled={importing || !canImport}
          className="font-mono text-xs font-bold px-5 py-2.5 border border-[#b794f4]/50 text-[#c4a6f2] hover:bg-[#b794f4]/12 hover:border-[#b794f4] disabled:opacity-40 transition-colors"
        >
          {importing ? 'starting…' : `import from ${provider}`}
        </button>
      </div>
    </SettingSection>
  );
}

function SettingsTab({ project }: { project: Project }) {
  const [url, setUrl]             = useState(project.slack_webhook_url ?? '');
  const [alertOnError, setAlertOnError] = useState(project.alert_on_error ?? true);
  const [rateThreshold, setRateThreshold] = useState(Math.round((project.alert_error_rate_threshold ?? 0.25) * 100));
  const [rateWindow, setRateWindow]   = useState(project.alert_error_rate_window ?? 20);
  const [sentryDsn, setSentryDsn]   = useState(project.sentry_dsn ?? '');
  const [sentryLevel, setSentryLevel] = useState<'critical' | 'warning' | 'none'>((project.sentry_alert_level as 'critical' | 'warning' | 'none') ?? 'critical');
  const [slackAnomalyLevel, setSlackAnomalyLevel] = useState<'critical' | 'warning' | 'none'>((project.slack_anomaly_level as 'critical' | 'warning' | 'none') ?? 'critical');
  const [budget, setBudget]         = useState(project.monthly_budget_usd?.toString() ?? '');
  const [webhookUrl, setWebhookUrl] = useState(project.webhook_url ?? '');
  const [webhookLevel, setWebhookLevel] = useState<'critical' | 'warning' | 'none'>((project.webhook_anomaly_level as 'critical' | 'warning' | 'none') ?? 'critical');
  const [webhookSecret, setWebhookSecret] = useState(project.webhook_secret ?? '');
  const [testingOut, setTestingOut] = useState(false);
  const [thresholdMode, setThresholdMode] = useState<'dynamic' | 'manual'>((project.threshold_mode as 'dynamic' | 'manual') ?? 'dynamic');
  const [systemicEnabled, setSystemicEnabled] = useState(project.systemic_enabled ?? true);
  const [systemicWindow, setSystemicWindow]   = useState((project.systemic_window_min ?? 10).toString());
  const [systemicMinRuns, setSystemicMinRuns] = useState((project.systemic_min_runs ?? 5).toString());
  const [manualLatency, setManualLatency] = useState(project.threshold_latency_ms?.toString() ?? '');
  const [manualTokens, setManualTokens]   = useState(project.threshold_tokens?.toString() ?? '');
  const [manualCost, setManualCost]       = useState(project.threshold_cost?.toString() ?? '');
  const [baseline, setBaseline]     = useState<ThresholdData | null>(null);
  const [saving, setSaving]         = useState(false);
  const [testing, setTesting]       = useState(false);
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [group, setGroup]           = useState<'alerts' | 'detection' | 'data' | 'project'>('alerts');
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

  useEffect(() => {
    authFetch(`${BACKEND_URL}/projects/${project.id}/thresholds`)
      .then(r => r.json()).then(setBaseline).catch(() => {});
  }, [project.id, BACKEND_URL]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await authFetch(`${BACKEND_URL}/projects/${project.id}/webhook`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slack_webhook_url: url.trim() || null,
          alert_on_error: alertOnError,
          alert_error_rate_threshold: rateThreshold / 100,
          alert_error_rate_window: rateWindow,
          sentry_dsn: sentryDsn.trim() || null,
          sentry_alert_level: sentryLevel,
          slack_anomaly_level: slackAnomalyLevel,
          threshold_mode: thresholdMode,
          threshold_latency_ms: thresholdMode === 'manual' && manualLatency ? parseFloat(manualLatency) : null,
          threshold_tokens: thresholdMode === 'manual' && manualTokens ? parseFloat(manualTokens) : null,
          threshold_cost: thresholdMode === 'manual' && manualCost ? parseFloat(manualCost) : null,
          monthly_budget_usd: budget ? parseFloat(budget) : null,
          webhook_url: webhookUrl.trim() || null,
          webhook_anomaly_level: webhookLevel,
          systemic_enabled: systemicEnabled,
          systemic_window_min: systemicWindow ? parseInt(systemicWindow, 10) : null,
          systemic_min_runs: systemicMinRuns ? parseInt(systemicMinRuns, 10) : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json().catch(() => null);
      if (updated?.webhook_secret) setWebhookSecret(updated.webhook_secret);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    setTesting(true); setMsg(null);
    try {
      const res = await authFetch(`${BACKEND_URL}/projects/${project.id}/webhook/test`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ ok: true, text: 'Test message sent — check Slack.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function testOutbound() {
    setTestingOut(true); setMsg(null);
    try {
      const res = await authFetch(`${BACKEND_URL}/projects/${project.id}/outbound-webhook/test`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      setMsg({ ok: true, text: 'Test event delivered — check your endpoint.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setTestingOut(false);
    }
  }

  const alertLevelOptions = [
    { value: 'critical' as const, label: 'critical only' },
    { value: 'warning'  as const, label: 'warning + critical' },
    { value: 'none'     as const, label: 'off' },
  ];

  return (
    <div className="max-w-xl">

      <div className="mb-8">
        <SegmentedControl
          options={[
            { value: 'alerts'    as const, label: 'Alerts' },
            { value: 'detection' as const, label: 'Detection' },
            { value: 'data'      as const, label: 'Data' },
            { value: 'project'   as const, label: 'Project' },
          ]}
          value={group}
          onChange={setGroup}
        />
      </div>

      <div className="space-y-0">

      {group === 'data' && <ImportSection project={project} />}

      {group === 'alerts' && <>
      <SettingSection
        title="Slack alerts"
        description="Paste an Incoming Webhook URL to receive alerts in Slack."
      >
        <div className="space-y-4">
          <Field label="Webhook URL">
            <div className="flex gap-2">
              <input
                type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                className={inputCls}
              />
              <button
                onClick={testWebhook} disabled={testing || !url.trim()}
                className="px-4 py-2 font-mono text-xs border border-[#3a2f4e] text-[#b3abc4] hover:bg-[#2d2440] disabled:opacity-40 transition-colors shrink-0"
              >
                {testing ? 'sending…' : 'test'}
              </button>
            </div>
          </Field>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-xs text-[#c9c2d6]">Alert on every error call</p>
              <p className="font-mono text-[10px] text-[#7c7291] mt-0.5">Fires immediately whenever a call returns an error</p>
            </div>
            <Toggle checked={alertOnError} onChange={setAlertOnError} />
          </div>

          <div className="flex items-center gap-8">
            <Field label="Error rate threshold">
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={100} value={rateThreshold}
                  onChange={e => setRateThreshold(Number(e.target.value))}
                  className="w-20 bg-[#201a2b] border border-[#3a2f4e] px-3 py-2 font-mono text-xs text-[#c9c2d6] focus:outline-none focus:border-[#4a3d63] text-center"
                />
                <span className="font-mono text-xs text-[#7c7291]">%</span>
              </div>
            </Field>
            <Field label="Over last">
              <div className="flex items-center gap-2">
                <input
                  type="number" min={5} max={100} value={rateWindow}
                  onChange={e => setRateWindow(Number(e.target.value))}
                  className="w-20 bg-[#201a2b] border border-[#3a2f4e] px-3 py-2 font-mono text-xs text-[#c9c2d6] focus:outline-none focus:border-[#4a3d63] text-center"
                />
                <span className="font-mono text-xs text-[#7c7291]">calls</span>
              </div>
            </Field>
          </div>

          <Field label="Anomaly alerts">
            <SegmentedControl options={alertLevelOptions} value={slackAnomalyLevel} onChange={setSlackAnomalyLevel} />
            <p className="font-mono text-[10px] text-[#7c7291] mt-2">
              {slackAnomalyLevel === 'critical' && 'Alerts when anomaly score reaches ≥ 100pts.'}
              {slackAnomalyLevel === 'warning'  && 'Alerts on any anomaly hit, even below threshold.'}
              {slackAnomalyLevel === 'none'      && 'No anomaly alerts sent to Slack.'}
            </p>
          </Field>
        </div>
      </SettingSection>

      <SettingSection
        title="Sentry integration"
        description="When Cernova detects a critical anomaly, it sends a structured event to your Sentry project — grouped by step name, tagged with model and layer."
      >
        <div className="space-y-4">
          <Field label="Sentry DSN">
            <input
              type="url" value={sentryDsn} onChange={e => setSentryDsn(e.target.value)}
              placeholder="https://…@o….ingest.sentry.io/…"
              className={inputCls}
            />
            <p className="font-mono text-[10px] text-[#7c7291] mt-1.5">Settings → Client Keys (DSN) in your Sentry project.</p>
          </Field>
          <Field label="Forward to Sentry when">
            <SegmentedControl options={alertLevelOptions} value={sentryLevel} onChange={setSentryLevel} />
            <p className="font-mono text-[10px] text-[#7c7291] mt-2">
              {sentryLevel === 'critical' && 'Sends to Sentry when run score crosses the threshold (≥ 100pts).'}
              {sentryLevel === 'warning'  && 'Sends to Sentry for any anomaly hit, even below threshold.'}
              {sentryLevel === 'none'      && 'Sentry DSN saved but no events will be forwarded.'}
            </p>
          </Field>
        </div>
      </SettingSection>

      <SettingSection
        title="Outbound webhook"
        description="POST the structured anomaly event to any endpoint — PagerDuty, n8n, your own automation. Signed with a per-project HMAC key so you can verify it's really from Cernova."
      >
        <div className="space-y-4">
          <Field label="Webhook URL">
            <div className="flex gap-2">
              <input
                type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://your-endpoint.example.com/hook"
                className={inputCls}
              />
              <button
                onClick={testOutbound} disabled={testingOut || !webhookUrl.trim()}
                className="px-4 py-2 font-mono text-xs border border-[#3a2f4e] text-[#b3abc4] hover:bg-[#2d2440] disabled:opacity-40 transition-colors shrink-0"
              >
                {testingOut ? 'sending…' : 'test'}
              </button>
            </div>
            <p className="font-mono text-[10px] text-[#7c7291] mt-1.5">Save first, then test — the test reads the saved URL.</p>
          </Field>
          <Field label="Deliver when">
            <SegmentedControl options={alertLevelOptions} value={webhookLevel} onChange={setWebhookLevel} />
            <p className="font-mono text-[10px] text-[#7c7291] mt-2">
              {webhookLevel === 'critical' && 'Delivers when run score crosses the threshold (≥ 100pts).'}
              {webhookLevel === 'warning'  && 'Delivers on any anomaly hit, even below threshold.'}
              {webhookLevel === 'none'      && 'Webhook saved but nothing is delivered.'}
            </p>
          </Field>
          {webhookSecret && (
            <Field label="Signing secret">
              <code className="block bg-[#201a2b] border border-[#3a2f4e] px-3 py-2 font-mono text-[11px] text-[#b3abc4] break-all">{webhookSecret}</code>
              <p className="font-mono text-[10px] text-[#7c7291] mt-1.5">Verify the <span className="text-[#9a91ad]">X-Cernova-Signature</span> header: <span className="text-[#9a91ad]">sha256=HMAC_SHA256(secret, raw_body)</span>.</p>
            </Field>
          )}
        </div>
      </SettingSection>
      </>}

      {group === 'detection' && <>
      <SettingSection
        title="Numeric thresholds"
        description="Latency, token, and cost limits for anomaly detection."
      >
        <div className="space-y-4">
          <SegmentedControl
            options={[{ value: 'dynamic' as const, label: 'dynamic' }, { value: 'manual' as const, label: 'manual' }]}
            value={thresholdMode}
            onChange={setThresholdMode}
          />
          {thresholdMode === 'dynamic' ? (
            baseline ? (
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-[#7c7291]">
                  {baseline.mode === 'dynamic'
                    ? `Learned from ${baseline.calls_used} calls (p95). Updates automatically.`
                    : `Static defaults active — ${baseline.calls_needed} more calls needed to adapt.`}
                </p>
                {[
                  { label: 'Latency', value: baseline.thresholds.latency_ms_max != null ? `${baseline.thresholds.latency_ms_max.toLocaleString()}ms` : '—', sub: baseline.baselines?.latency_ms?.p50 != null ? `p50 ${baseline.baselines.latency_ms.p50.toLocaleString()}ms` : null },
                  { label: 'Tokens',  value: baseline.thresholds.total_tokens_max != null ? baseline.thresholds.total_tokens_max.toLocaleString() : '—', sub: baseline.baselines?.total_tokens?.p50 != null ? `p50 ${Math.round(baseline.baselines.total_tokens.p50).toLocaleString()}` : null },
                  { label: 'Cost',    value: baseline.thresholds.cost_max != null ? `$${baseline.thresholds.cost_max.toFixed(4)}` : '—', sub: baseline.baselines?.cost?.p50 != null ? `p50 $${baseline.baselines.cost.p50.toFixed(4)}` : null },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="flex items-center justify-between border-b border-[#332946] py-2 last:border-b-0">
                    <span className="font-mono text-[11px] text-[#9a91ad]">{label}</span>
                    <div className="text-right">
                      <span className="font-mono text-[11px] text-[#c9c2d6]">{value}</span>
                      {sub && <div className="font-mono text-[10px] text-[#7c7291]">{sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="font-mono text-[10px] text-[#7c7291]">loading baseline…</p>
          ) : (
            <div className="space-y-3">
              <p className="font-mono text-[10px] text-[#7c7291]">Override limits — leave blank to keep the static default.</p>
              {[
                { label: 'Max latency (ms)', placeholder: '10000', value: manualLatency, onChange: setManualLatency },
                { label: 'Max total tokens', placeholder: '50000', value: manualTokens, onChange: setManualTokens },
                { label: 'Max cost (USD)',   placeholder: '1.00',  value: manualCost,   onChange: setManualCost },
              ].map(({ label, placeholder, value, onChange }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <label className="font-mono text-[11px] text-[#9a91ad] shrink-0">{label}</label>
                  <input
                    type="number" min="0" step="any" placeholder={placeholder} value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-36 bg-[#201a2b] border border-[#3a2f4e] px-3 py-1.5 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection
        title="Systemic incidents"
        description="Fire one high-severity alert when the same failure hits many runs in a short window — a macro trend, not a one-off."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[11px] text-[#9a91ad]">Detect incidents</label>
            <Toggle checked={systemicEnabled} onChange={setSystemicEnabled} />
          </div>
          <div className={systemicEnabled ? 'space-y-3' : 'space-y-3 opacity-40 pointer-events-none'}>
            <div className="flex items-center justify-between gap-4">
              <label className="font-mono text-[11px] text-[#9a91ad] shrink-0">Min runs to trip</label>
              <input
                type="number" min="2" step="1" placeholder="5" value={systemicMinRuns}
                onChange={e => setSystemicMinRuns(e.target.value)}
                className="w-36 bg-[#201a2b] border border-[#3a2f4e] px-3 py-1.5 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="font-mono text-[11px] text-[#9a91ad] shrink-0">Window (minutes)</label>
              <input
                type="number" min="1" step="1" placeholder="10" value={systemicWindow}
                onChange={e => setSystemicWindow(e.target.value)}
                className="w-36 bg-[#201a2b] border border-[#3a2f4e] px-3 py-1.5 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]"
              />
            </div>
            <p className="font-mono text-[10px] text-[#7c7291] leading-5">
              e.g. {systemicMinRuns || '5'} distinct runs hitting the same condition within {systemicWindow || '10'} min opens an incident. A higher min suits high-traffic projects.
            </p>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title="Monthly budget"
        description="Get a Slack alert when AI analysis spend crosses this amount in the current calendar month."
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#7c7291]">$</span>
          <input
            type="number" min="0" step="0.01" placeholder="e.g. 10.00" value={budget}
            onChange={e => setBudget(e.target.value)}
            className="w-36 bg-[#201a2b] border border-[#3a2f4e] px-3 py-2 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]"
          />
          <span className="font-mono text-[10px] text-[#7c7291]">USD / month — leave blank to disable</span>
        </div>
      </SettingSection>
      </>}

      {group === 'project' && (
      <SettingSection title="Project details">
        <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">
          {[
            { label: 'Project ID', value: project.id, mono: true },
            { label: 'API key',    value: `${project.API_KEY.slice(0, 12)}…`, mono: true },
            { label: 'Created',   value: new Date(project.created_at).toLocaleDateString() },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-[11px] text-[#7c7291]">{label}</span>
              <span className="font-mono text-[11px] text-[#b3abc4]">{value}</span>
            </div>
          ))}
        </div>
      </SettingSection>
      )}

      </div>

      {(group === 'alerts' || group === 'detection') && (
      <div className="pt-8 border-t border-[#3a2f4e]">
        {msg && <p className={['font-mono text-xs mb-4', msg.ok ? 'text-[#7fb59a]' : 'text-[#e0533d]'].join(' ')}>{msg.text}</p>}
        <button
          onClick={save} disabled={saving}
          className="font-mono text-xs font-bold px-5 py-2.5 bg-[#b794f4] text-[#201a2b] hover:bg-[#c9b0f8] disabled:opacity-50 transition-colors"
        >
          {saving ? 'saving…' : 'save settings'}
        </button>
      </div>
      )}

    </div>
  );
}
