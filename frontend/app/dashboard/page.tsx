'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Badge, StatCard, CopyButton } from '@/components/ui';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

interface Project {
  id: string;
  name: string;
  API_KEY: string;
  owner: string;
  created_at: string;
  call_count: number;
  error_count: number;
  anomaly_count: number;
  last_active: string | null;
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

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail]       = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }
      setEmail(session.user.email ?? null);

      const { data: profile } = await supabase
        .from('PROFILES')
        .select('id')
        .eq('email', session.user.email)
        .single();

      if (!profile) { setLoading(false); return; }

      const res = await fetch(`${BACKEND}/projects/owner/${profile.id}`);
      if (res.ok) setProjects(await res.json());
      setLoading(false);
    }
    load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  const totalCalls    = projects.reduce((s, p) => s + p.call_count, 0);
  const totalErrors   = projects.reduce((s, p) => s + p.error_count, 0);
  const totalAnomalies = projects.reduce((s, p) => s + p.anomaly_count, 0);

  return (
    <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased">

      {/* Nav */}
      <div className="border-b border-[#3a2f4e]">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 font-sans font-black text-sm text-[#e9e4f0]">
              <img src="/logo.svg" alt="Cernova" className="w-5 h-5" />
              Cernova
            </a>
            <span className="text-[#7c7291]">|</span>
            <span className="font-mono text-[11px] text-[#9a91ad]">{email}</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="/docs" className="font-mono text-[11px] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">docs</a>
            <a href="/settings" className="font-mono text-[11px] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">settings</a>
            <a href="/create-project" className="font-mono text-[11px] font-bold px-4 py-1.5 bg-[#b794f4] hover:bg-[#b794f4] text-[#e9e4f0] transition-colors">
              + new project
            </a>
            <button onClick={signOut} className="font-mono text-[11px] text-[#7c7291] hover:text-[#e9e4f0] transition-colors">
              sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="font-mono text-xs text-[#7c7291] py-8">loading…</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-32">
            <p className="font-sans font-black text-2xl text-[#e9e4f0] mb-2">No projects yet</p>
            <p className="font-mono text-xs text-[#9a91ad] mb-8">Create a project to start tracing your AI workflows</p>
            <a
              href="/create-project"
              className="font-mono text-xs font-bold px-6 py-3 bg-[#b794f4] hover:bg-[#b794f4] text-[#e9e4f0] transition-colors"
            >
              create first project →
            </a>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#3a2f4e] mb-8">
              <StatCard label="Total calls"       value={totalCalls.toLocaleString()} />
              <StatCard label="Errors"            value={totalErrors.toLocaleString()} alert={totalErrors > 0} />
              <StatCard label="Anomalies flagged" value={totalAnomalies.toLocaleString()} alert={totalAnomalies > 0} />
            </div>

            {/* Project list */}
            <div>
              <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-3">
                Projects ({projects.length})
              </p>
              <div className="bg-[#281f38] border border-[#3a2f4e] divide-y divide-[#3a2f4e]">
                {projects.map((p) => {
                  const errorRate = p.call_count > 0 ? p.error_count / p.call_count : 0;
                  const statusVariant = errorRate === 0 ? 'ok' : errorRate < 0.1 ? 'warning' : 'error';
                  return (
                    <a
                      key={p.id}
                      href={`/dashboard/${p.id}`}
                      className="flex items-center justify-between gap-6 px-5 py-4 hover:bg-[#2d2440] transition-colors group"
                    >
                      {/* Left */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant={statusVariant}>{statusVariant}</Badge>
                          <span className="font-sans font-bold text-sm text-[#e9e4f0] group-hover:text-[#e9e4f0] transition-colors">
                            {p.name}
                          </span>
                          <span className="font-mono text-[10px] text-[#7c7291]">#{p.id.slice(0, 8)}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <code className="font-mono text-[11px] text-[#7fb59a] truncate">{p.API_KEY}</code>
                          <CopyButton value={p.API_KEY} />
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-8 shrink-0 text-right">
                        <div>
                          <div className="font-sans font-black text-lg text-[#e9e4f0]">{p.call_count.toLocaleString()}</div>
                          <div className="font-mono text-[10px] text-[#7c7291]">calls</div>
                        </div>
                        <div>
                          <div className={`font-sans font-black text-lg ${p.error_count > 0 ? 'text-[#e0533d]' : 'text-[#6b6180]'}`}>
                            {p.error_count}
                          </div>
                          <div className="font-mono text-[10px] text-[#7c7291]">errors</div>
                        </div>
                        <div>
                          <div className={`font-sans font-black text-lg ${p.anomaly_count > 0 ? 'text-[#d9c964]' : 'text-[#6b6180]'}`}>
                            {p.anomaly_count}
                          </div>
                          <div className="font-mono text-[10px] text-[#7c7291]">anomalies</div>
                        </div>
                        <div>
                          <div className="font-mono text-xs text-[#b3abc4]">{timeAgo(p.last_active)}</div>
                          <div className="font-mono text-[10px] text-[#7c7291]">last active</div>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
