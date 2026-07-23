'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const inputCls = 'w-full bg-[#201a2b] border border-[#3a2f4e] px-3 py-2.5 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady]       = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password !== confirm) { setMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    if (password.length < 6)  { setMsg({ ok: false, text: 'Password must be at least 6 characters.' }); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      setMsg({ ok: true, text: 'Password updated! Redirecting…' });
      setTimeout(() => router.replace('/dashboard'), 1500);
    }
  }

  return (
    <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <a href="/" className="inline-flex items-center gap-2 font-sans font-black text-lg text-[#e9e4f0]">
            <img src="/logo.svg" alt="" className="w-5 h-5" />
            Cernova
          </a>
          <p className="font-mono text-[11px] text-[#9a91ad] mt-2">set a new password</p>
        </div>

        <div className="bg-[#281f38] border border-[#3a2f4e] p-8">
          {!ready ? (
            <p className="font-mono text-xs text-[#7c7291] text-center">verifying reset link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">New password</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">Confirm password</label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
              {msg && <p className={`font-mono text-[11px] ${msg.ok ? 'text-[#7fb59a]' : 'text-[#e0533d]'}`}>{msg.text}</p>}
              <button type="submit" disabled={loading} className="w-full bg-[#b794f4] text-[#201a2b] py-2.5 font-mono text-xs font-bold hover:bg-[#c9b0f8] disabled:opacity-50 transition-colors">
                {loading ? 'saving…' : 'set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
