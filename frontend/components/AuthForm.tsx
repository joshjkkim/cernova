'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot';

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.error_description === 'string') return e.error_description;
    if (typeof e.error === 'string') return e.error;
    return JSON.stringify(err);
  }
  return 'Something went wrong';
}

const inputCls = 'w-full bg-[#201a2b] border border-[#3a2f4e] px-3 py-2.5 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]';

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode]         = useState<Mode>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleOAuth(provider: 'github' | 'google') {
    setError(null);
    setInfo(null);
    const origin = window.location.origin;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/dashboard` },
    });
    // On success the browser navigates away; only errors land here.
    if (oauthError) setError(extractMessage(oauthError));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setInfo('Check your email for a reset link. Supabase limits 2 reset emails per hour.');
      } else if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        router.push('/dashboard');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(extractMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="bg-[#281f38] border border-[#3a2f4e] p-8">
        <h2 className="font-sans font-black text-sm text-[#e9e4f0] mb-1">Reset password</h2>
        <p className="font-mono text-[11px] text-[#9a91ad] mb-6">
          Enter your email and we&apos;ll send a reset link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
          </div>
          {error && <p className="font-mono text-[11px] text-[#e0533d]">{error}</p>}
          {info  && <p className="font-mono text-[11px] text-[#7fb59a]">{info}</p>}
          <button type="submit" disabled={loading} className="w-full bg-[#b794f4] text-[#201a2b] py-2.5 font-mono text-xs font-bold hover:bg-[#c9b0f8] disabled:opacity-50 transition-colors">
            {loading ? 'sending…' : 'send reset link'}
          </button>
        </form>
        <button
          onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
          className="mt-5 font-mono text-[11px] text-[#7c7291] hover:text-[#e9e4f0] transition-colors"
        >
          ← back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#281f38] border border-[#3a2f4e]">
      {/* Tab switcher */}
      <div className="flex border-b border-[#3a2f4e]">
        {(['signin', 'signup'] as const).map((m, i) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setInfo(null); }}
            className={[
              'flex-1 py-3 font-mono text-xs transition-colors',
              i === 0 ? 'border-r border-[#3a2f4e]' : '',
              mode === m ? 'bg-[#332946] text-[#e9e4f0] font-bold' : 'text-[#9a91ad] hover:text-[#c9c2d6]',
            ].join(' ')}
          >
            {m === 'signin' ? 'sign in' : 'sign up'}
          </button>
        ))}
      </div>

      <div className="p-8 pb-0 space-y-2">
        <button
          type="button"
          onClick={() => handleOAuth('github')}
          className="w-full flex items-center justify-center gap-2 border border-[#3a2f4e] hover:border-[#4a3d63] bg-[#201a2b] py-2.5 font-mono text-xs text-[#c9c2d6] hover:text-[#e9e4f0] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          continue with GitHub
        </button>
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          className="w-full flex items-center justify-center gap-2 border border-[#3a2f4e] hover:border-[#4a3d63] bg-[#201a2b] py-2.5 font-mono text-xs text-[#c9c2d6] hover:text-[#e9e4f0] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 11v2.4h6.8c-.27 1.77-2.05 5.2-6.8 5.2-4.09 0-7.43-3.39-7.43-7.6S7.91 3.4 12 3.4c2.33 0 3.89.99 4.78 1.85l3.25-3.13C17.95.36 15.24-1 12-1 5.39-1 .04 4.35.04 11S5.39 23 12 23c6.92 0 11.52-4.87 11.52-11.72 0-.79-.09-1.39-.19-1.99L12 11Z" transform="translate(0 1)" />
          </svg>
          continue with Google
        </button>
        <div className="flex items-center gap-3 pt-2">
          <div className="flex-1 border-t border-[#3a2f4e]" />
          <span className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">or</span>
          <div className="flex-1 border-t border-[#3a2f4e]" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-4">
        <div>
          <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest">Password</label>
            {mode === 'signin' && (
              <button type="button" onClick={() => { setMode('forgot'); setError(null); setInfo(null); }} className="font-mono text-[10px] text-[#7c7291] hover:text-[#e9e4f0] transition-colors">
                forgot password?
              </button>
            )}
          </div>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
        </div>
        {error && <p className="font-mono text-[11px] text-[#e0533d]">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-[#b794f4] text-[#201a2b] py-2.5 font-mono text-xs font-bold hover:bg-[#c9b0f8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? 'loading…' : mode === 'signin' ? 'sign in' : 'create account'}
        </button>
      </form>
    </div>
  );
}
