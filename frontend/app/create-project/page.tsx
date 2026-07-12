'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return 'trace_' + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const inputCls = 'w-full bg-[#201a2b] border border-[#3a2f4e] px-3 py-2.5 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]';

export default function CreateProject() {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [apiKey, setApiKey]       = useState('');
  const [name, setName]           = useState('');
  const [created, setCreated]     = useState<{ id: string; apiKey: string; name: string } | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    setApiKey(generateApiKey());
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/'); return; }
      const { data: profile } = await supabase.from('PROFILES').select('id').eq('email', session.user.email).single();
      if (profile) setProfileId(profile.id);
    }
    loadProfile();
  }, [router]);

  async function handleCreate() {
    if (!profileId || !name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: profileId, API_KEY: apiKey, name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const project = await res.json();
      setCreated({ id: project.id, apiKey, name: name.trim() });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(created!.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (created) {
    return (
      <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#281f38] border border-[#3a2f4e]">

            {/* Header */}
            <div className="border-b border-[#3a2f4e] px-6 py-5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#7fb59a] shrink-0" />
              <div>
                <p className="font-sans font-black text-sm text-[#e9e4f0]">{created.name}</p>
                <p className="font-mono text-[10px] text-[#7c7291] mt-0.5">project id: {created.id}</p>
              </div>
            </div>

            <div className="px-6 py-6 space-y-5">
              {/* API key */}
              <div>
                <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">
                  API key — copy it now, it won&apos;t be shown again
                </p>
                <div className="flex items-center gap-2 border border-[#3a2f4e] bg-[#201a2b]">
                  <code className="flex-1 font-mono text-[11px] text-[#7fb59a] px-3 py-2.5 truncate">
                    {created.apiKey}
                  </code>
                  <button
                    onClick={copyKey}
                    className="shrink-0 px-4 py-2.5 font-mono text-[11px] text-[#9a91ad] hover:text-[#e9e4f0] border-l border-[#3a2f4e] transition-colors"
                  >
                    {copied ? 'copied ✓' : 'copy'}
                  </button>
                </div>
              </div>

              {/* Code snippet */}
              <div className="border border-[#3a2f4e]">
                <div className="border-b border-[#3a2f4e] px-4 py-2">
                  <span className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">typescript</span>
                </div>
                <pre className="px-4 py-4 font-mono text-[11px] text-[#cdb9f7] leading-6 overflow-x-auto">{`const tracer = new Tracer({
  apiKey: '${created.apiKey}',
})`}</pre>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-[#b794f4] text-[#201a2b] py-2.5 font-mono text-xs font-bold hover:bg-[#c9b0f8] transition-colors"
              >
                go to dashboard →
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <a href="/dashboard" className="font-mono text-[11px] text-[#7c7291] hover:text-[#e9e4f0] transition-colors">← dashboard</a>
        </div>
        <div className="bg-[#281f38] border border-[#3a2f4e]">
          <div className="border-b border-[#3a2f4e] px-6 py-5">
            <h1 className="font-sans font-black text-lg text-[#e9e4f0]">New project</h1>
            <p className="font-mono text-[11px] text-[#9a91ad] mt-1">Creates a project and generates an SDK API key</p>
          </div>

          <div className="px-6 py-6 space-y-5">
            <div>
              <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">Project name</label>
              <input
                type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="my-ai-app"
                className={inputCls}
              />
            </div>

            <div>
              <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">Generated API key</p>
              <code className="block border border-[#3a2f4e] bg-[#201a2b] px-3 py-2.5 font-mono text-[11px] text-[#7fb59a] truncate">
                {apiKey || '—'}
              </code>
            </div>

            {error && <p className="font-mono text-[11px] text-[#e0533d]">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 py-2.5 font-mono text-xs text-[#9a91ad] hover:text-[#e9e4f0] border border-[#3a2f4e] hover:border-[#4a3d63] transition-colors"
              >
                cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !profileId || !name.trim()}
                className="flex-1 bg-[#b794f4] hover:bg-[#b794f4] text-[#e9e4f0] py-2.5 font-mono text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'creating…' : 'create project'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
